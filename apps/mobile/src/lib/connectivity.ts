import { Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/** Estado simplificado de conectividad de red para la app móvil. */
export type ConnectivityStatus = 'online' | 'offline';

/** Callback invocado cuando cambia el estado de conectividad. */
export type ConnectivityListener = (status: ConnectivityStatus) => void;

/**
 * Traduce el estado entregado por NetInfo a 'online' u 'offline'.
 * Se considera en línea únicamente cuando hay conexión activa y la alcanzabilidad a internet no es false.
 */
export function resolveConnectivityStatus(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
): ConnectivityStatus {
  // On web NetInfo's reachability ping (a cross-origin request) often fails behind blockers or
  // slow networks and would wrongly report «offline»; the browser's own flag is enough there.
  if (
    state.isConnected === true &&
    (Platform.OS === 'web' || state.isInternetReachable !== false)
  ) {
    return 'online';
  }
  return 'offline';
}

/**
 * Obtiene el estado actual de conectividad consultando NetInfo.
 */
export async function getConnectivity(): Promise<ConnectivityStatus> {
  const state = await NetInfo.fetch();
  return resolveConnectivityStatus(state);
}

/**
 * Suscribe un listener a los cambios de conectividad de NetInfo emitiendo 'online' | 'offline'.
 * Devuelve una función para cancelar la suscripción.
 */
export function subscribeToConnectivity(listener: ConnectivityListener): () => void {
  return NetInfo.addEventListener((state) => {
    listener(resolveConnectivityStatus(state));
  });
}
