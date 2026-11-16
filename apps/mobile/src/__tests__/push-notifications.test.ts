import { Linking, Platform } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  ExecutionEnvironment: { StoreClient: 'storeClient' },
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'mock-eas-project-id',
        },
      },
    },
  },
}));

vi.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    isAvailableAsync: vi.fn(async () => true),
    getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, val: string) => {
      store.set(key, val);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  };
});

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as notifApi from '../lib/notifications-api.js';
import {
  clearStoredPushToken,
  enableNotifications,
  getNotificationsPermission,
  getStoredPushToken,
  initPushNotifications,
  registerPushNotifications,
  saveStoredPushToken,
  unregisterPushNotifications,
} from '../lib/push-notifications.js';

describe('Push Notifications Utilities (NK-36)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearStoredPushToken();
  });

  describe('initPushNotifications', () => {
    it('no configura handler en entorno web', () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';

      const spy = vi.spyOn(Notifications, 'setNotificationHandler');
      initPushNotifications();
      expect(spy).not.toHaveBeenCalled();

      Platform.OS = originalOS;
    });

    it('configura notification handler en plataformas nativas', () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';

      const spy = vi.spyOn(Notifications, 'setNotificationHandler');
      initPushNotifications();
      expect(spy).toHaveBeenCalled();

      Platform.OS = originalOS;
    });
  });

  describe('registerPushNotifications', () => {
    it('retorna null inmediatamente si corre en entorno web (guarda web)', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';

      const token = await registerPushNotifications();
      expect(token).toBeNull();

      Platform.OS = originalOS;
    });

    it('retorna null si no es un dispositivo fisico (!Device.isDevice)', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';
      // @ts-expect-error mock mutable isDevice
      Device.isDevice = false;

      const token = await registerPushNotifications();
      expect(token).toBeNull();

      // @ts-expect-error restore
      Device.isDevice = true;
      Platform.OS = originalOS;
    });

    it('retorna null si corre en Expo Go (Constants.appOwnership === "expo")', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';
      // @ts-expect-error mock mutable isDevice
      Device.isDevice = true;

      const Constants = (await import('expo-constants')).default;
      // @ts-expect-error mock appOwnership
      Constants.appOwnership = 'expo';

      const token = await registerPushNotifications();
      expect(token).toBeNull();

      // @ts-expect-error restore
      Constants.appOwnership = undefined;
      Platform.OS = originalOS;
    });

    it('solicita permisos, obtiene token push de Expo y lo registra en la API', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';
      // @ts-expect-error mock mutable isDevice
      Device.isDevice = true;

      vi.spyOn(Notifications, 'getPermissionsAsync').mockResolvedValue({
        status: 'granted',
      } as never);

      vi.spyOn(Notifications, 'getExpoPushTokenAsync').mockResolvedValue({
        data: 'ExponentPushToken[unit-test-token-789]',
      } as never);

      const registerApiSpy = vi
        .spyOn(notifApi, 'registerPushDeviceApi')
        .mockResolvedValue({} as never);

      const token = await registerPushNotifications();
      expect(token).toBe('ExponentPushToken[unit-test-token-789]');
      expect(registerApiSpy).toHaveBeenCalledWith({
        token: 'ExponentPushToken[unit-test-token-789]',
        platform: 'android',
      });

      // Debe haber guardado el token en almacenamiento persistente
      const stored = await getStoredPushToken();
      expect(stored).toBe('ExponentPushToken[unit-test-token-789]');

      Platform.OS = originalOS;
    });

    it('retorna null si el usuario deniega los permisos', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';
      // @ts-expect-error mock mutable isDevice
      Device.isDevice = true;

      vi.spyOn(Notifications, 'getPermissionsAsync').mockResolvedValue({
        status: 'undetermined',
      } as never);

      vi.spyOn(Notifications, 'requestPermissionsAsync').mockResolvedValue({
        status: 'denied',
      } as never);

      const token = await registerPushNotifications();
      expect(token).toBeNull();

      Platform.OS = originalOS;
    });
  });

  describe('unregisterPushNotifications', () => {
    it('elimina el token registrado en la API y limpia el almacenamiento local en plataformas nativas', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';

      await saveStoredPushToken('ExponentPushToken[to-delete]');

      const unregisterApiSpy = vi
        .spyOn(notifApi, 'unregisterPushDeviceApi')
        .mockResolvedValue(undefined);

      await unregisterPushNotifications();

      expect(unregisterApiSpy).toHaveBeenCalledWith('ExponentPushToken[to-delete]');
      expect(await getStoredPushToken()).toBeNull();

      Platform.OS = originalOS;
    });

    it('no realiza llamadas en entorno web (guarda web)', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';

      await saveStoredPushToken('ExponentPushToken[web-token]');
      const unregisterApiSpy = vi.spyOn(notifApi, 'unregisterPushDeviceApi');

      await unregisterPushNotifications();

      expect(unregisterApiSpy).not.toHaveBeenCalled();

      Platform.OS = originalOS;
    });

    it('no realiza llamadas si no habia ningun token guardado', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';

      const unregisterApiSpy = vi.spyOn(notifApi, 'unregisterPushDeviceApi');

      await unregisterPushNotifications();

      expect(unregisterApiSpy).not.toHaveBeenCalled();

      Platform.OS = originalOS;
    });
  });

  describe('getNotificationsPermission / enableNotifications (NK-52)', () => {
    it('reports granted, denied and unavailable (web)', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';
      const permissions = vi.spyOn(Notifications, 'getPermissionsAsync');

      permissions.mockResolvedValueOnce({ status: 'granted' } as never);
      await expect(getNotificationsPermission()).resolves.toBe('granted');

      permissions.mockResolvedValueOnce({ status: 'undetermined' } as never);
      await expect(getNotificationsPermission()).resolves.toBe('denied');

      permissions.mockRejectedValueOnce(new Error('native module missing'));
      await expect(getNotificationsPermission()).resolves.toBe('unavailable');

      Platform.OS = 'web';
      await expect(getNotificationsPermission()).resolves.toBe('unavailable');
      await expect(enableNotifications()).resolves.toBe('unavailable');

      Platform.OS = originalOS;
    });

    it('asks for the permission and registers the device when it can still ask', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';
      const permissions = vi.spyOn(Notifications, 'getPermissionsAsync');
      permissions.mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true } as never);
      permissions.mockResolvedValue({ status: 'granted' } as never);
      vi.spyOn(Notifications, 'getExpoPushTokenAsync').mockResolvedValue({
        data: 'ExponentPushToken[enable-token]',
      } as never);
      const registerApiSpy = vi
        .spyOn(notifApi, 'registerPushDeviceApi')
        .mockResolvedValue({} as never);

      await expect(enableNotifications()).resolves.toBe('granted');
      expect(registerApiSpy).toHaveBeenCalled();

      Platform.OS = originalOS;
    });

    it('opens the phone settings when the permission cannot be asked again', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';
      const openSettings = vi.fn(async () => {});
      (Linking as { openSettings: () => Promise<void> }).openSettings = openSettings;
      vi.spyOn(Notifications, 'getPermissionsAsync').mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      } as never);

      await expect(enableNotifications()).resolves.toBe('denied');
      expect(openSettings).toHaveBeenCalledTimes(1);

      Platform.OS = originalOS;
    });
  });
});
