import type { ChildResponse, CreateChildInput } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import { useOptionalAuth } from '../context/auth-context.js';
import i18n from '../i18n/index.js';
import { createChild, fetchCaregiverChildren } from '../lib/children-api.js';
import {
  deleteCachedChildren,
  readCachedChildren,
  upsertCachedChild,
  writeCachedChildren,
} from '../lib/offline-cache.js';
import { classifyLoadError, readThrough, type LoadErrorKind } from '../lib/offline-read.js';

export type ChildrenStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface ChildrenHookState {
  status: ChildrenStatus;
  children: ChildResponse[];
  error: string | null;
  fromCache?: boolean;
  stale?: boolean;
  lastSyncedAt?: string | null;
  loadError?: LoadErrorKind | null;
}

export function useChildren() {
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;

  const [state, setState] = useState<ChildrenHookState>({
    status: 'idle',
    children: [],
    error: null,
    fromCache: false,
    stale: false,
    lastSyncedAt: null,
    loadError: null,
  });

  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<ChildResponse[] | null> => {
    const requestId = ++latestLoad.current;

    setState((prev) => ({
      ...prev,
      status: prev.children.length === 0 ? 'loading' : prev.status,
      error: null,
      loadError: null,
    }));

    try {
      const result = await readThrough<ChildResponse[]>({
        operationName: 'useChildren.load',
        readLocal: () => (userId ? readCachedChildren(userId) : Promise.resolve(null)),
        fetchRemote: () => fetchCaregiverChildren(),
        writeLocal: (data) => (userId ? writeCachedChildren(userId, data) : Promise.resolve(null)),
        deleteLocal: () => (userId ? deleteCachedChildren(userId) : Promise.resolve()),
        onLocalData: (local) => {
          if (requestId !== latestLoad.current) return;
          setState({
            status: local.data.length === 0 ? 'empty' : 'ready',
            children: local.data,
            error: null,
            fromCache: true,
            stale: false,
            lastSyncedAt: local.lastSyncedAt,
            loadError: null,
          });
        },
      });

      if (requestId !== latestLoad.current) return result.data;

      setState({
        status: result.data.length === 0 ? 'empty' : 'ready',
        children: result.data,
        error: null,
        fromCache: result.fromCache,
        stale: result.stale,
        lastSyncedAt: result.lastSyncedAt,
        loadError: null,
      });
      return result.data;
    } catch (err) {
      if (requestId !== latestLoad.current) return null;

      const kind = classifyLoadError(err);
      const message =
        kind === 'needs-connection'
          ? i18n.t('errors:offlineNoData')
          : err instanceof Error
            ? err.message
            : i18n.t('errors:consent.childList');

      setState({
        status: 'error',
        children: [],
        error: message,
        fromCache: false,
        stale: false,
        lastSyncedAt: null,
        loadError: kind,
      });
      return null;
    }
  }, [userId]);

  const create = useCallback(
    async (input: CreateChildInput): Promise<ChildResponse> => {
      setState((prev) => ({ ...prev, status: 'loading', error: null, loadError: null }));

      try {
        const newChild = await createChild(input);
        if (userId) {
          void upsertCachedChild(userId, newChild);
        }
        setState((prev) => {
          const updated = [...prev.children, newChild];
          return {
            status: 'ready',
            children: updated,
            error: null,
            fromCache: false,
            stale: false,
            lastSyncedAt: new Date().toISOString(),
            loadError: null,
          };
        });
        return newChild;
      } catch (err) {
        const message = err instanceof Error ? err.message : i18n.t('errors:children.create');
        setState((prev) => ({
          ...prev,
          status: prev.children.length === 0 ? 'empty' : 'ready',
          error: message,
          loadError: 'error',
        }));
        throw err;
      }
    },
    [userId],
  );

  return {
    ...state,
    load,
    create,
  };
}
