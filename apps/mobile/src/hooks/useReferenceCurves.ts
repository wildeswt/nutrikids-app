import type { ReferenceCurvesQuery, ReferenceCurvesResponse } from '@nutrikids/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import {
  deleteCachedReferenceCurve,
  isReferenceCurveFresh,
  readCachedReferenceCurve,
  writeCachedReferenceCurve,
} from '../lib/offline-cache.js';
import { classifyLoadError, readThrough, type LoadErrorKind } from '../lib/offline-read.js';
import { fetchReferenceCurves } from '../lib/reference-api.js';

export type ReferenceCurvesStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReferenceCurvesHookState {
  status: ReferenceCurvesStatus;
  curves: ReferenceCurvesResponse | null;
  error: string | null;
  fromCache?: boolean;
  stale?: boolean;
  lastSyncedAt?: string | null;
  loadError?: LoadErrorKind | null;
}

/**
 * WHO reference curves for the given indicator/sex/position. Loads on mount and whenever the
 * query changes; pass `null` to wait (for example while the child is not known yet).
 */
export function useReferenceCurves(query: ReferenceCurvesQuery | null) {
  const [state, setState] = useState<ReferenceCurvesHookState>({
    status: 'idle',
    curves: null,
    error: null,
    fromCache: false,
    stale: false,
    lastSyncedAt: null,
    loadError: null,
  });

  /** Only the latest load may update the state (the indicator can change while one is in flight). */
  const latestLoad = useRef(0);

  const indicator = query?.indicator;
  const sex = query?.sex;
  const position = query?.position;

  const load = useCallback(async (): Promise<ReferenceCurvesResponse | null> => {
    const requestId = ++latestLoad.current;
    if (!indicator || !sex) {
      setState({
        status: 'idle',
        curves: null,
        error: null,
        fromCache: false,
        stale: false,
        lastSyncedAt: null,
        loadError: null,
      });
      return null;
    }

    const normalizedQuery: ReferenceCurvesQuery = {
      indicator,
      sex,
      ...(position ? { position } : {}),
    };

    setState({
      status: 'loading',
      curves: null,
      error: null,
      fromCache: false,
      stale: false,
      lastSyncedAt: null,
      loadError: null,
    });

    try {
      const cached = await readCachedReferenceCurve(normalizedQuery);
      if (cached && isReferenceCurveFresh(cached.fetchedAt)) {
        if (requestId !== latestLoad.current) return cached.curve;
        setState({
          status: 'ready',
          curves: cached.curve,
          error: null,
          fromCache: true,
          stale: false,
          lastSyncedAt: cached.fetchedAt,
          loadError: null,
        });
        return cached.curve;
      }

      const result = await readThrough<ReferenceCurvesResponse>({
        operationName: 'useReferenceCurves.load',
        readLocal: async () =>
          cached ? { data: cached.curve, lastSyncedAt: cached.fetchedAt } : null,
        fetchRemote: () => fetchReferenceCurves(normalizedQuery),
        writeLocal: (data) => writeCachedReferenceCurve(normalizedQuery, data),
        deleteLocal: () => deleteCachedReferenceCurve(normalizedQuery),
        onLocalData: (local) => {
          if (requestId !== latestLoad.current) return;
          setState({
            status: 'ready',
            curves: local.data,
            error: null,
            fromCache: true,
            stale: true,
            lastSyncedAt: local.lastSyncedAt,
            loadError: null,
          });
        },
      });

      if (requestId !== latestLoad.current) return result.data;

      setState({
        status: 'ready',
        curves: result.data,
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
          ? i18n.t('errors:reference.offlineNoData')
          : err instanceof Error
            ? err.message
            : i18n.t('errors:reference.fetch');

      setState({
        status: 'error',
        curves: null,
        error: message,
        fromCache: false,
        stale: false,
        lastSyncedAt: null,
        loadError: kind,
      });
      return null;
    }
  }, [indicator, sex, position]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...state,
    load,
  };
}
