import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getConnectivity,
  subscribeToConnectivity,
  type ConnectivityStatus,
} from '../lib/connectivity.js';

/** Estado de conectividad de red expuesto a la interfaz de usuario. */
export interface ConnectionContextValue {
  status: ConnectivityStatus;
  isOnline: boolean;
}

const DEFAULT_CONNECTION_VALUE: ConnectionContextValue = {
  status: 'online',
  isOnline: true,
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export interface ConnectionProviderProps {
  children: React.ReactNode;
}

/**
 * Proveedor global del estado de conectividad (`online` / `offline`) respaldado por `NetInfo`.
 */
export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const [status, setStatus] = useState<ConnectivityStatus>('online');

  useEffect(() => {
    let mounted = true;

    void getConnectivity()
      .then((initialStatus) => {
        if (mounted) {
          setStatus(initialStatus);
        }
      })
      .catch(() => {});

    const unsubscribe = subscribeToConnectivity((nextStatus) => {
      if (mounted) {
        setStatus(nextStatus);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      status,
      isOnline: status === 'online',
    }),
    [status],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

/**
 * Devuelve el estado de conectividad actual. Si se invoca sin `ConnectionProvider`
 * (por ejemplo, en pruebas unitarias aisladas), retorna `online` por defecto.
 */
export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  return context ?? DEFAULT_CONNECTION_VALUE;
}
