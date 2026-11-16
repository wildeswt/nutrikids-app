import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context.js';
import { useConnection } from '../context/connection-context.js';
import { syncEngine } from '../lib/sync/index.js';
import { useSyncStatus } from './useSyncStatus.js';

/** Acción en curso dentro del flujo de cierre de sesión para bloquear dobles toques. */
export type SignOutBusyAction = 'sync' | 'delete' | null;

export interface UseSignOutFlowOptions {
  /** Navegación opcional hacia la pantalla «Pendientes de envío». */
  onGoToPendingSync?: () => void;
}

export interface SignOutPendingDialogProps {
  visible: boolean;
  unsentCount: number;
  isOnline: boolean;
  confirmDeleteStep: boolean;
  busyAction: SignOutBusyAction;
  syncFailedCount: number | null;
  canGoToPendingSync: boolean;
  onSyncAndSignOut: () => void;
  onRequestDeleteConfirm: () => void;
  onConfirmDeleteAndSignOut: () => void;
  onGoToPendingSync: () => void;
  onCancel: () => void;
}

export interface UseSignOutFlowResult {
  isSigningOut: boolean;
  dialogVisible: boolean;
  unsentCount: number;
  confirmDeleteStep: boolean;
  busyAction: SignOutBusyAction;
  syncFailedCount: number | null;
  requestSignOut: () => Promise<void>;
  syncAndSignOut: () => Promise<void>;
  openDeleteConfirmation: () => void;
  confirmDeleteAndSignOut: () => Promise<void>;
  cancelDialog: () => void;
  goToPendingSync: () => void;
  dialogProps: SignOutPendingDialogProps;
}

function countUnsent(state: { pending: number; sending: number; error: number }): number {
  return state.pending + state.sending + state.error;
}

/**
 * Coordina el cierre de sesión seguro:
 * - Sin registros pendientes en cola: cierra sesión y limpia almacenamiento sin mostrar diálogo.
 * - Con registros en estado `LOCAL`, `SENDING` o `ERROR`: abre el diálogo de confirmación para
 *   sincronizar antes de salir, borrar bajo doble confirmación o cancelar sin perder datos.
 */
export function useSignOutFlow(options: UseSignOutFlowOptions = {}): UseSignOutFlowResult {
  const { onGoToPendingSync } = options;
  const { signOut } = useAuth();
  const syncStatus = useSyncStatus();
  const { isOnline } = useConnection();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [busyAction, setBusyAction] = useState<SignOutBusyAction>(null);
  const [isDirectSigningOut, setIsDirectSigningOut] = useState(false);
  const [syncFailedCount, setSyncFailedCount] = useState<number | null>(null);
  const [lockedUnsentCount, setLockedUnsentCount] = useState(0);

  const busyRef = useRef<'direct' | 'sync' | 'delete' | null>(null);

  const liveUnsentCount = countUnsent(syncStatus);
  const dialogUnsentCount =
    dialogVisible && liveUnsentCount === 0 && lockedUnsentCount > 0
      ? lockedUnsentCount
      : liveUnsentCount;

  const resetDialogState = useCallback(() => {
    setDialogVisible(false);
    setConfirmDeleteStep(false);
    setSyncFailedCount(null);
    setLockedUnsentCount(0);
  }, []);

  const executeSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const requestSignOut = useCallback(async (): Promise<void> => {
    if (busyRef.current !== null) {
      return;
    }

    const stateCount = countUnsent(syncStatus);
    const engineCount = countUnsent(syncEngine.getSyncState());
    const currentUnsent = stateCount > 0 ? stateCount : engineCount;

    if (currentUnsent === 0) {
      busyRef.current = 'direct';
      setIsDirectSigningOut(true);
      try {
        await executeSignOut();
      } finally {
        busyRef.current = null;
        setIsDirectSigningOut(false);
      }
      return;
    }

    setLockedUnsentCount(currentUnsent);
    setConfirmDeleteStep(false);
    setSyncFailedCount(null);
    setDialogVisible(true);
  }, [executeSignOut, syncStatus]);

  const syncAndSignOut = useCallback(async (): Promise<void> => {
    if (busyRef.current !== null || !isOnline) {
      return;
    }

    busyRef.current = 'sync';
    setBusyAction('sync');
    setSyncFailedCount(null);

    let syncThrew = false;
    try {
      await syncStatus.syncNow();
    } catch {
      syncThrew = true;
    }

    const afterState = syncEngine.getSyncState();
    const remaining = countUnsent(afterState);

    if (syncThrew || remaining > 0) {
      setSyncFailedCount(remaining > 0 ? remaining : Math.max(dialogUnsentCount, 1));
      busyRef.current = null;
      setBusyAction(null);
      return;
    }

    try {
      await executeSignOut();
      resetDialogState();
    } finally {
      busyRef.current = null;
      setBusyAction(null);
    }
  }, [dialogUnsentCount, executeSignOut, isOnline, resetDialogState, syncStatus]);

  const openDeleteConfirmation = useCallback((): void => {
    if (busyRef.current !== null) {
      return;
    }
    setConfirmDeleteStep(true);
  }, []);

  const confirmDeleteAndSignOut = useCallback(async (): Promise<void> => {
    if (busyRef.current !== null) {
      return;
    }

    busyRef.current = 'delete';
    setBusyAction('delete');

    try {
      await executeSignOut();
      resetDialogState();
    } finally {
      busyRef.current = null;
      setBusyAction(null);
    }
  }, [executeSignOut, resetDialogState]);

  const cancelDialog = useCallback((): void => {
    if (busyRef.current !== null) {
      return;
    }
    resetDialogState();
  }, [resetDialogState]);

  const goToPendingSync = useCallback((): void => {
    if (busyRef.current !== null || !onGoToPendingSync) {
      return;
    }
    resetDialogState();
    onGoToPendingSync();
  }, [onGoToPendingSync, resetDialogState]);

  const isSigningOut = isDirectSigningOut || busyAction !== null;

  return {
    isSigningOut,
    dialogVisible,
    unsentCount: dialogUnsentCount,
    confirmDeleteStep,
    busyAction,
    syncFailedCount,
    requestSignOut,
    syncAndSignOut,
    openDeleteConfirmation,
    confirmDeleteAndSignOut,
    cancelDialog,
    goToPendingSync,
    dialogProps: {
      visible: dialogVisible,
      unsentCount: dialogUnsentCount,
      isOnline,
      confirmDeleteStep,
      busyAction,
      syncFailedCount,
      canGoToPendingSync: Boolean(onGoToPendingSync),
      onSyncAndSignOut: () => void syncAndSignOut(),
      onRequestDeleteConfirm: openDeleteConfirmation,
      onConfirmDeleteAndSignOut: () => void confirmDeleteAndSignOut(),
      onGoToPendingSync: goToPendingSync,
      onCancel: cancelDialog,
    },
  };
}
