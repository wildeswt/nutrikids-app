import type { CheckupResponse, CreateCheckupInput } from '@nutrikids/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../context/auth-context.js';
import { useConnection } from '../context/connection-context.js';
import i18n from '../i18n/index.js';
import { fetchChildCheckups, fetchProfessionalCheckups } from '../lib/checkups-api.js';
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
  createCheckupWithOfflineFallback,
  type CreateCheckupResult,
} from '../lib/offline-checkup.js';
import { classifyLoadError, readThrough, type LoadErrorKind } from '../lib/offline-read.js';

export type CheckupsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export type { CaregiverCheckupListItem } from '../lib/offline-cache.js';
export type { CreateCheckupResult } from '../lib/offline-checkup.js';

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
  const { isOnline } = useConnection();

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
    async (input: CreateCheckupInput): Promise<CreateCheckupResult> => {
      if (!childId) {
        throw new Error(i18n.t('errors:checkups.missingChild'));
      }

      setSaving(true);
      try {
        const result = await createCheckupWithOfflineFallback({
          userId,
          childId,
          input,
          isOnline,
        });
        const listItem: CaregiverCheckupListItem = {
          id: result.id,
          childId: result.childId,
          measuredAt: result.measuredAt,
          weightKg: result.weightKg,
          lengthHeightCm: result.lengthHeightCm,
          position: result.position,
          origin: result.origin,
          recordedById: result.recordedById,
          recordedBy: result.recordedBy,
          correctedCheckupId: result.correctedCheckupId,
          isCurrent: result.isCurrent,
          notes: result.notes,
          createdAt: result.createdAt,
          ...(result.localOnly ? { localOnly: true } : {}),
        };
        setState((prev) => ({
          status: 'ready',
          checkups: sortCheckupsNewestFirst([
            listItem,
            ...prev.checkups.filter((item) => item.id !== listItem.id),
          ]),
          error: null,
          fromCache: result.savedLocally ? true : false,
          stale: false,
          lastSyncedAt: result.savedLocally ? prev.lastSyncedAt : new Date().toISOString(),
          loadError: null,
        }));
        return result;
      } finally {
        setSaving(false);
      }
    },
    [childId, isOnline, userId],
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

export interface ProfessionalCheckupsHookState {
  status: CheckupsStatus;
  checkups: CheckupResponse[];
  error: string | null;
}

/**
 * Current checkups of a child with full technical results (`zScore`, `percentile`, `classification`)
 * for the professional view (RF-10).
 */
export function useProfessionalCheckups(
  childId: string | null,
  options: { autoLoad?: boolean } = {},
) {
  const autoLoad = options.autoLoad ?? true;
  const [state, setState] = useState<ProfessionalCheckupsHookState>({
    status: 'idle',
    checkups: [],
    error: null,
  });
  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<CheckupResponse[] | null> => {
    const requestId = ++latestLoad.current;
    if (!childId) {
      setState({ status: 'idle', checkups: [], error: null });
      return null;
    }

    setState({ status: 'loading', checkups: [], error: null });

    try {
      const allCheckups = await fetchProfessionalCheckups(childId);
      const currentCheckups = allCheckups.filter((item) => item.isCurrent);
      if (requestId !== latestLoad.current) return currentCheckups;
      setState({
        status: currentCheckups.length === 0 ? 'empty' : 'ready',
        checkups: currentCheckups,
        error: null,
      });
      return currentCheckups;
    } catch (err) {
      if (requestId !== latestLoad.current) return null;
      setState({
        status: 'error',
        checkups: [],
        error: err instanceof Error ? err.message : i18n.t('errors:checkups.fetch'),
      });
      return null;
    }
  }, [childId]);

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  return {
    ...state,
    load,
  };
}
