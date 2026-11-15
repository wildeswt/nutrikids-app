import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '../context/connection-context.js';
import {
  deriveConnectionBarState,
  SYNCED_BANNER_DURATION_MS,
  type ConnectionBarState,
} from '../lib/connection-bar.js';
import { useSyncStatus } from './useSyncStatus.js';

/**
 * Combina conectividad y estado de la cola de sincronización para alimentar la barra de conexión,
 * manteniendo visible el estado transitorio «Todo sincronizado» durante 3 segundos al vaciarse
 * la cola estando en línea.
 */
export function useConnectionBarState(): ConnectionBarState {
  const { isOnline } = useConnection();
  const { pending, sending, error } = useSyncStatus();

  const unsentCount = Math.max(0, pending) + Math.max(0, sending) + Math.max(0, error);
  const prevUnsentRef = useRef<number>(unsentCount);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justSynced, setJustSynced] = useState(false);

  const clearSyncedTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const previousUnsent = prevUnsentRef.current;
    prevUnsentRef.current = unsentCount;

    if (unsentCount > 0 || !isOnline) {
      clearSyncedTimer();
      setJustSynced(false);
      return;
    }

    if (previousUnsent > 0 && unsentCount === 0) {
      clearSyncedTimer();
      setJustSynced(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setJustSynced(false);
      }, SYNCED_BANNER_DURATION_MS);
    }
  }, [clearSyncedTimer, isOnline, unsentCount]);

  useEffect(() => {
    return () => {
      clearSyncedTimer();
    };
  }, [clearSyncedTimer]);

  return deriveConnectionBarState({
    isOnline,
    pending,
    sending,
    error,
    justSynced,
  });
}
