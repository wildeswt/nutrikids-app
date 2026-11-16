import type { AlertDetailResponse, CheckupResponse, ChildResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { fetchAlertDetail, updateAlertStatus } from '../lib/alerts-api.js';
import { fetchProfessionalCheckups } from '../lib/checkups-api.js';
import { fetchChild } from '../lib/children-api.js';
import {
  deleteCachedChild,
  deleteCachedProfessionalCheckups,
  readCachedChild,
  readCachedProfessionalCheckups,
  upsertCachedChild,
  writeCachedProfessionalCheckups,
} from '../lib/offline-cache.js';
import { readThrough, type ReadThroughResult } from '../lib/offline-read.js';

export interface UseAlertDetailResult {
  alert: AlertDetailResponse | null;
  /** `null` while unknown or when its request failed (the screen falls back to a generic name). */
  child: ChildResponse | null;
  /** Checkups with technical results for the chart; `null` when they could not be loaded. */
  checkups: CheckupResponse[] | null;
  loading: boolean;
  /** The alert itself could not be loaded. */
  error: string | null;
  /** Saving the review. */
  marking: boolean;
  /** The review failed (invalid transition, concurrent change, no connection...). */
  actionError: string | null;
  fromCache?: boolean;
  stale?: boolean;
  lastSyncedAt?: string | null;
  reload: () => Promise<void>;
  markReviewed: () => Promise<boolean>;
}

/**
 * Alert detail for the professional: the alert with its history, plus the child and their
 * checkups for the chart. Only the alert is required; the other two degrade to a generic name / a notice.
 */
export function useAlertDetail(
  alertId: string | undefined,
  options: { userId?: string | null } = {},
): UseAlertDetailResult {
  const userId = options.userId ?? null;
  const [alert, setAlert] = useState<AlertDetailResponse | null>(null);
  const [child, setChild] = useState<ChildResponse | null>(null);
  const [checkups, setCheckups] = useState<CheckupResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  // Only the latest request may write state (the alert can change while one is in flight).
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (!alertId) {
      setLoading(false);
      setError(i18n.t('errors:alerts.detail'));
      return;
    }
    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      const detail = await fetchAlertDetail(alertId);

      const loadChild = (): Promise<ReadThroughResult<ChildResponse>> =>
        userId
          ? readThrough({
              operationName: 'useAlertDetail.child',
              readLocal: () => readCachedChild(userId, detail.childId),
              fetchRemote: () => fetchChild(detail.childId),
              writeLocal: (data) => upsertCachedChild(userId, data),
              deleteLocal: () => deleteCachedChild(userId, detail.childId),
            })
          : fetchChild(detail.childId).then((data) => ({
              data,
              fromCache: false,
              stale: false,
              lastSyncedAt: null,
            }));

      const loadCheckups = (): Promise<ReadThroughResult<CheckupResponse[]>> =>
        userId
          ? readThrough({
              operationName: 'useAlertDetail.checkups',
              readLocal: () => readCachedProfessionalCheckups(userId, detail.childId),
              fetchRemote: () => fetchProfessionalCheckups(detail.childId),
              writeLocal: (data) => writeCachedProfessionalCheckups(userId, detail.childId, data),
              deleteLocal: () => deleteCachedProfessionalCheckups(userId, detail.childId),
            })
          : fetchProfessionalCheckups(detail.childId).then((data) => ({
              data,
              fromCache: false,
              stale: false,
              lastSyncedAt: null,
            }));

      const [childResult, checkupsResult] = await Promise.allSettled([loadChild(), loadCheckups()]);
      if (id !== requestId.current) return;

      const childRes = childResult.status === 'fulfilled' ? childResult.value : null;
      const checkupsRes = checkupsResult.status === 'fulfilled' ? checkupsResult.value : null;
      const usedCache = Boolean(childRes?.fromCache || checkupsRes?.fromCache);
      const isStale = Boolean(
        (childRes?.fromCache && childRes.stale) || (checkupsRes?.fromCache && checkupsRes.stale),
      );
      const syncedAt =
        (checkupsRes?.fromCache && checkupsRes.stale ? checkupsRes.lastSyncedAt : null) ??
        (childRes?.fromCache && childRes.stale ? childRes.lastSyncedAt : null) ??
        checkupsRes?.lastSyncedAt ??
        childRes?.lastSyncedAt ??
        null;

      setAlert(detail);
      setChild(childRes ? childRes.data : null);
      setCheckups(checkupsRes ? checkupsRes.data : null);
      setFromCache(usedCache);
      setStale(isStale);
      setLastSyncedAt(syncedAt);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : i18n.t('errors:alerts.detail'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [alertId, userId]);

  const markReviewed = useCallback(async (): Promise<boolean> => {
    if (!alertId) return false;
    setMarking(true);
    setActionError(null);
    try {
      const updated = await updateAlertStatus(alertId, 'REVIEWED');
      setAlert(updated);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : i18n.t('errors:alerts.review'));
      return false;
    } finally {
      setMarking(false);
    }
  }, [alertId]);

  return {
    alert,
    child,
    checkups,
    loading,
    error,
    marking,
    actionError,
    fromCache,
    stale,
    lastSyncedAt,
    reload,
    markReviewed,
  };
}
