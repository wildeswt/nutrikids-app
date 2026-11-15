import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context.js';
import { listPending } from '../lib/follow-up-storage.js';
import { useSyncStatus } from './useSyncStatus.js';

/**
 * Consulta cuántos seguimientos siguen esperando en la cola general para una alerta.
 *
 * El envío automático corre en segundo plano desde el motor de sincronización; este hook
 * observa cambios del motor (`useSyncStatus`) y actualiza el contador sin forzar un vaciado.
 */
export function usePendingFollowUps(alertId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const syncStatus = useSyncStatus();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async (): Promise<void> => {
    if (!userId) {
      setPendingCount(0);
      return;
    }
    try {
      const pending = await listPending(userId);
      setPendingCount(pending.filter((entry) => entry.alertId === alertId).length);
    } catch {
      setPendingCount(0);
    }
  }, [userId, alertId]);

  useEffect(() => {
    void refreshPending();
  }, [
    refreshPending,
    syncStatus.pending,
    syncStatus.sending,
    syncStatus.error,
    syncStatus.lastSyncedAt,
  ]);

  return { pendingCount, refreshPending };
}
