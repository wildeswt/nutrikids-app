import { OPEN_ALERT_STATUSES, type AlertResponse, type ChildResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { fetchAlerts } from '../lib/alerts-api.js';
import { fetchCaregiverChildren } from '../lib/children-api.js';
import { buildPatientList, type PatientListItem } from '../lib/patients.js';

export interface UsePatientsResult {
  patients: PatientListItem[];
  children: ChildResponse[];
  alerts: AlertResponse[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Loads the active patients linked to the professional alongside their open alerts,
 * and derives the categorized, risk-ordered patient list.
 */
export function usePatients(): UsePatientsResult {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [children, setChildren] = useState<ChildResponse[]>([]);
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevents stale responses from overriding newer requests
  const requestId = useRef(0);

  const load = useCallback(async (isRefresh: boolean) => {
    const id = ++requestId.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [fetchedChildren, fetchedAlerts] = await Promise.all([
        fetchCaregiverChildren(),
        fetchAlerts({ statuses: OPEN_ALERT_STATUSES }),
      ]);

      if (id !== requestId.current) return;

      setChildren(fetchedChildren);
      setAlerts(fetchedAlerts);
      setPatients(buildPatientList(fetchedChildren, fetchedAlerts));
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : i18n.t('errors:children.fetch'));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return {
    patients,
    children,
    alerts,
    loading,
    refreshing,
    error,
    reload,
    refresh,
  };
}
