import type { CaregiverCheckupResponse, CreateCheckupInput } from '@nutrikids/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../context/auth-context.js';
import i18n from '../i18n/index.js';
import { createChildCheckup, fetchChildCheckups } from '../lib/checkups-api.js';
import { checkupsRepository } from '../lib/local-db/index.js';
import {
  deleteCachedCaregiverCheckups,
  mergeServerAndLocalCheckups,
  readCachedCaregiverCheckups,
  readLocalOnlyCheckups,
  sortCheckupsNewestFirst,
  writeCachedCaregiverCheckups,
  type CaregiverCheckupListItem,
} from '../lib/offline-cache.js';
import {
  classifyLoadError,
  readThrough,
  tryGetLocalDatabase,
  tryLocalOperation,
  type LoadErrorKind,
} from '../lib/offline-read.js';

export type CheckupsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export type { CaregiverCheckupListItem } from '../lib/offline-cache.js';

export interface CheckupsHookState {
  status: CheckupsStatus;
  checkups: CaregiverCheckupListItem[];
  error: string | null;
  fromCache?: boolean;
  stale?: boolean;
  lastSyncedAt?: string | null;
  loadError?: LoadErrorKind | null;
}

/**
 * Current checkups of a child (newest first). Loads on mount and whenever `childId` changes
 * (unless `autoLoad` is false); `create` registers a new one and adds it to the list.
 */
export function useCheckups(childId: string | null, options: { autoLoad?: boolean } = {}) {
  const autoLoad = options.autoLoad ?? true;
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;

  const [state, setState] = useState<CheckupsHookState>({
    status: 'idle',
    checkups: [],
    error: null,
    fromCache: false,
    stale: false,
    lastSyncedAt: null,
    loadError: null,
  });
  const [saving, setSaving] = useState(false);
  /** Only the latest load may update the state (the child can change while one is in flight). */
  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<CaregiverCheckupListItem[] | null> => {
    const requestId = ++latestLoad.current;
    if (!childId) {
      setState({
        status: 'idle',
        checkups: [],
        error: null,
        fromCache: false,
        stale: false,
        lastSyncedAt: null,
        loadError: null,
      });
      return null;
    }

    setState({
      status: 'loading',
      checkups: [],
      error: null,
      fromCache: false,
      stale: false,
      lastSyncedAt: null,
      loadError: null,
    });

    try {
      const result = await readThrough<CaregiverCheckupListItem[]>({
        operationName: 'useCheckups.load',
        readLocal: () =>
          userId ? readCachedCaregiverCheckups(userId, childId) : Promise.resolve(null),
        fetchRemote: () => fetchChildCheckups(childId),
        writeLocal: (data) =>
          userId ? writeCachedCaregiverCheckups(userId, childId, data) : Promise.resolve(null),
        deleteLocal: () =>
          userId ? deleteCachedCaregiverCheckups(userId, childId) : Promise.resolve(),
        onLocalData: (local) => {
          if (requestId !== latestLoad.current) return;
          setState({
            status: local.data.length === 0 ? 'empty' : 'ready',
            checkups: local.data,
            error: null,
            fromCache: true,
            stale: false,
            lastSyncedAt: local.lastSyncedAt,
            loadError: null,
          });
        },
      });

      let combined = result.data;
      if (!result.fromCache && userId) {
        const localOnly = await readLocalOnlyCheckups(userId, childId);
        combined = mergeServerAndLocalCheckups(result.data, localOnly);
      }

      if (requestId !== latestLoad.current) return combined;

      setState({
        status: combined.length === 0 ? 'empty' : 'ready',
        checkups: combined,
        error: null,
        fromCache: result.fromCache,
        stale: result.stale,
        lastSyncedAt: result.lastSyncedAt,
        loadError: null,
      });
      return combined;
    } catch (err) {
      if (requestId !== latestLoad.current) return null;

      const kind = classifyLoadError(err);
      const message =
        kind === 'needs-connection'
          ? i18n.t('errors:offlineNoData')
          : err instanceof Error
            ? err.message
            : i18n.t('errors:checkups.fetch');

      setState({
        status: 'error',
        checkups: [],
        error: message,
        fromCache: false,
        stale: false,
        lastSyncedAt: null,
        loadError: kind,
      });
      return null;
    }
  }, [childId, userId]);

  const create = useCallback(
    async (input: CreateCheckupInput): Promise<CaregiverCheckupResponse> => {
      if (!childId) {
        throw new Error(i18n.t('errors:checkups.missingChild'));
      }

      setSaving(true);
      try {
        const checkup = await createChildCheckup(childId, input);
        if (userId) {
          const db = await tryGetLocalDatabase('useCheckups.create');
          if (db) {
            await tryLocalOperation(
              'useCheckups.create',
              () => checkupsRepository.upsertMany(db, userId, [checkup]),
              undefined,
            );
          }
        }
        setState((prev) => ({
          status: 'ready',
          checkups: sortCheckupsNewestFirst([
            checkup,
            ...prev.checkups.filter((item) => item.id !== checkup.id),
          ]),
          error: null,
          fromCache: false,
          stale: false,
          lastSyncedAt: new Date().toISOString(),
          loadError: null,
        }));
        return checkup;
      } finally {
        setSaving(false);
      }
    },
    [childId, userId],
  );

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  return {
    ...state,
    saving,
    load,
    create,
  };
}
