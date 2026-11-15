import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../context/auth-context.js';
import {
  discardPendingSyncItem,
  listPendingSyncItems,
  retryPendingSyncItem,
  type PendingSyncItem,
} from '../lib/pending-sync.js';
import { syncEngine } from '../lib/sync/index.js';
import { useSyncStatus } from './useSyncStatus.js';

export type {
  PendingSyncCheckupItem,
  PendingSyncFeedingItem,
  PendingSyncFollowUpItem,
  PendingSyncItem,
} from '../lib/pending-sync.js';

/** Estado y acciones expuestas por `usePendingSyncItems`. */
export interface UsePendingSyncItemsResult {
  items: PendingSyncItem[];
  loading: boolean;
  /** Controles que aún faltan por enviarse (`LOCAL`, `SENDING` o `ERROR`). */
  pendingCount: number;
  errorCount: number;
  isSyncing: boolean;
  refresh: () => Promise<void>;
  retryItem: (id: string) => Promise<void>;
  discardItem: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

/**
 * Lista los controles pendientes de envío del usuario actual (cola + control + nombre del niño)
 * e incluye los enviados de las últimas 24 horas. Se actualiza automáticamente al cambiar el
 * estado del motor de sincronización.
 */
export function usePendingSyncItems(): UsePendingSyncItemsResult {
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;
  const syncStatus = useSyncStatus();

  const [items, setItems] = useState<PendingSyncItem[]>([]);
  const [loading, setLoading] = useState(true);
  const requestCounter = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestCounter.current;
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const nextItems = await listPendingSyncItems(userId);
    if (requestId !== requestCounter.current) return;
    setItems(nextItems);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return syncEngine.subscribe(() => {
      void refresh();
    });
  }, [refresh]);

  const retryItem = useCallback(
    async (id: string) => {
      await retryPendingSyncItem(userId, id);
      await refresh();
    },
    [refresh, userId],
  );

  const discardItem = useCallback(
    async (id: string) => {
      await discardPendingSyncItem(userId, id);
      await refresh();
    },
    [refresh, userId],
  );

  const pendingCount = items.filter((item) => item.status !== 'SENT').length;
  const errorCount = items.filter((item) => item.status === 'ERROR').length;

  return {
    items,
    loading,
    pendingCount,
    errorCount,
    isSyncing: syncStatus.sending > 0,
    refresh,
    retryItem,
    discardItem,
    syncNow: syncStatus.syncNow,
  };
}
