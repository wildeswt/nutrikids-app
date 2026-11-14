import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { registerPushDeviceApi, unregisterPushDeviceApi } from './notifications-api.js';

export const PUSH_TOKEN_STORAGE_KEY = 'nutrikids.push.device_token';

const memoryPushTokenStorage = new Map<string, string>();

async function hasSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    if (await hasSecureStore()) {
      return await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    }
    return memoryPushTokenStorage.get(PUSH_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return memoryPushTokenStorage.get(PUSH_TOKEN_STORAGE_KEY) ?? null;
  }
}

export async function saveStoredPushToken(token: string): Promise<void> {
  try {
    if (await hasSecureStore()) {
      await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token);
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
      return;
    }
    memoryPushTokenStorage.set(PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    memoryPushTokenStorage.set(PUSH_TOKEN_STORAGE_KEY, token);
  }
}

export async function clearStoredPushToken(): Promise<void> {
  try {
    if (await hasSecureStore()) {
      await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore error
  } finally {
    memoryPushTokenStorage.delete(PUSH_TOKEN_STORAGE_KEY);
  }
}

/**
 * Inicializa el manejador de notificaciones locales de Expo para la app (NK-36).
 * Seguro para web (no-op).
 */
export function initPushNotifications(): void {
  if (Platform.OS === 'web') return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      }),
    });
  } catch (err) {
    console.warn('No se pudo inicializar el manejador de notificaciones:', err);
  }
}

/**
 * Solicita permisos y registra el token push del dispositivo en la API (NK-36).
 * Solo para dispositivos físicos nativos (retorna null en web o simuladores sin soporte).
 */
export async function registerPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.warn('Registro de push omitido: se requiere un dispositivo fisico');
    return null;
  }

  // En Expo Go para Android (SDK 53+), las notificaciones remotas no estan soportadas
  // y llamar al manager nativo lanza excepciones (NullPointerException).
  if (Constants.appOwnership === 'expo') {
    console.warn(
      'Registro de push omitido: Expo Go no soporta notificaciones remotas en Android desde SDK 53. Utilice un development build.',
    );
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Permiso de notificaciones push denegado');
      return null;
    }

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2D5F5A',
        });
      } catch (channelErr) {
        console.warn('No se pudo configurar el canal de notificaciones en Android:', channelErr);
      }
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const token = tokenResult.data;
    if (!token) return null;

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await registerPushDeviceApi({ token, platform });
    await saveStoredPushToken(token);

    return token;
  } catch (err) {
    console.error('Error al registrar dispositivo para notificaciones push:', err);
    return null;
  }
}

/**
 * Desregistra el dispositivo push de la API y limpia el token guardado (NK-36).
 * Llamado durante el cierre de sesion (signOut).
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const token = await getStoredPushToken();
    if (token) {
      await unregisterPushDeviceApi(token);
    }
  } catch (err) {
    console.warn('Error al desregistrar dispositivo push en el servidor:', err);
  } finally {
    await clearStoredPushToken();
  }
}
