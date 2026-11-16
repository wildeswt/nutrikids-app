import type { AlertResponse, AlertStatus } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { fetchAlerts } from '../lib/alerts-api.js';
import { fetchCaregiverChildren } from '../lib/children-api.js';

export interface UseAlertsResult {
  alerts: AlertResponse[];
  /** Child display names by id; alerts only carry `childId`. */
  childNames: Record<string, string>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Initial/filter-change load (shows the spinner). */
  reload: () => Promise<void>;
  /** Pull-to-refresh (keeps the list visible). */
  refresh: () => Promise<void>;
}

/**
 * Professional alert inbox: alerts for the given statuses plus the child names to show them.
 * Order is the server's (severity, risk type, age); it is never re-sorted here.
 */
export function useAlerts(statuses: readonly AlertStatus[]): UseAlertsResult {
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [childNames, setChildNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may write state (a slow response must not overwrite a newer filter).
  const requestId = useRef(0);

  const statusKey = statuses.join(',');

  const load = useCallback(
    async (isRefresh: boolean) => {
      const id = ++requestId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [items, children] = await Promise.all([
          fetchAlerts({ statuses: statusKey.split(',') as AlertStatus[] }),
          // Names are secondary: if this fails the cards fall back to a generic label.
          fetchCaregiverChildren().catch(() => []),
        ]);
        if (id !== requestId.current) return;
        setAlerts(items);
        setChildNames(
          Object.fromEntries(children.map((c) => [c.id, `${c.firstName} ${c.lastName}`])),
        );
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : i18n.t('errors:alerts.list'));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [statusKey],
  );

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { alerts, childNames, loading, refreshing, error, reload, refresh };
}
