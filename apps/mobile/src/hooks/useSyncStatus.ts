import { useCallback, useSyncExternalStore } from 'react';
import { syncEngine, type SyncState } from '../lib/sync/index.js';

/** Resultado del hook `useSyncStatus` con los conteos de cola y el disparo manual. */
export interface UseSyncStatusResult extends SyncState {
  syncNow: () => Promise<void>;
}

/**
 * Suscribe un componente al estado observable del motor de sincronización
 * (`pending`, `sending`, `error`, `lastSyncedAt`) y expone `syncNow()` para reintento manual.
 */
export function useSyncStatus(): UseSyncStatusResult {
  const state = useSyncExternalStore(
    syncEngine.subscribe,
    syncEngine.getSyncState,
    syncEngine.getSyncState,
  );

  const syncNow = useCallback(async () => {
    await syncEngine.syncNow();
  }, []);

  return {
    ...state,
    syncNow,
  };
}
