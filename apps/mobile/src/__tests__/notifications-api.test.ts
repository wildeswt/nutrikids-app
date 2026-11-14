import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import * as apiModule from '../lib/api.js';
import {
  fetchNotificationsApi,
  markNotificationReadApi,
  registerPushDeviceApi,
  unregisterPushDeviceApi,
} from '../lib/notifications-api.js';

describe('Notifications API Client (NK-36)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerPushDeviceApi', () => {
    it('envia POST a /notifications/devices con el payload validado', async () => {
      const mockDevice = {
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        platform: 'android',
        lastSeenAt: '2026-11-14T10:00:00.000Z',
      };

      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify(mockDevice), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await registerPushDeviceApi({
        token: 'ExponentPushToken[mock-token-123]',
        platform: 'android',
      });

      expect(authFetchSpy).toHaveBeenCalledWith('/notifications/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'ExponentPushToken[mock-token-123]',
          platform: 'android',
        }),
      });

      expect(result).toEqual(mockDevice);
    });

    it('lanza error si la respuesta HTTP no es exitosa', async () => {
      vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'BadRequest', message: 'Token invalido' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        registerPushDeviceApi({
          token: 'token',
          platform: 'ios',
        }),
      ).rejects.toThrow('Token invalido');
    });
  });

  describe('unregisterPushDeviceApi', () => {
    it('envia DELETE a /notifications/devices/:token', async () => {
      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify({ count: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await unregisterPushDeviceApi('ExponentPushToken[test]');

      expect(authFetchSpy).toHaveBeenCalledWith(
        '/notifications/devices/ExponentPushToken%5Btest%5D',
        { method: 'DELETE' },
      );
    });

    it('no lanza error si el dispositivo responde 404 (ya no existia)', async () => {
      vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'NotFound', message: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(unregisterPushDeviceApi('token')).resolves.not.toThrow();
    });
  });

  describe('fetchNotificationsApi', () => {
    it('obtiene y valida la lista de notificaciones con GET /notifications', async () => {
      const mockList = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          userId: '22222222-2222-4222-8222-222222222222',
          type: 'alert_new',
          entityType: 'alert',
          entityId: '33333333-3333-4333-8333-333333333333',
          sentAt: '2026-11-14T10:00:00.000Z',
          readAt: null,
        },
      ];

      vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify(mockList), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await fetchNotificationsApi();
      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('alert_new');
      expect(result[0]?.readAt).toBeNull();
    });
  });

  describe('markNotificationReadApi', () => {
    it('envia PATCH a /notifications/:id/read y retorna la notificacion actualizada', async () => {
      const updatedMock = {
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        type: 'alert_new',
        entityType: 'alert',
        entityId: '33333333-3333-4333-8333-333333333333',
        sentAt: '2026-11-14T10:00:00.000Z',
        readAt: '2026-11-14T10:05:00.000Z',
      };

      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify(updatedMock), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await markNotificationReadApi(updatedMock.id);
      expect(authFetchSpy).toHaveBeenCalledWith(`/notifications/${updatedMock.id}/read`, {
        method: 'PATCH',
      });
      expect(result.readAt).toBe('2026-11-14T10:05:00.000Z');
    });
  });
});
