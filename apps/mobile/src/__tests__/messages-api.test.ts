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
  MessageApiError,
  MessageNetworkError,
  fetchChildProfessionals,
  fetchConversations,
  fetchMessages,
  filterActiveProfessionals,
  getMessageErrorMessage,
  isMessageNetworkError,
  markThreadReadApi,
  sendMessageApi,
} from '../lib/messages-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const USER_A = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';
const MSG_ID = '44444444-4444-4444-8444-444444444444';

describe('Messages API Client (NK-50)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchConversations', () => {
    it('obtiene y valida conversaciones con GET /messages/conversations', async () => {
      const mockConversations = [
        {
          childId: CHILD_ID,
          participant: {
            userId: USER_B,
            firstName: 'Laura',
            lastName: 'Pérez',
            role: 'PROFESSIONAL',
            specialty: 'nutrition',
          },
          lastMessage: {
            id: MSG_ID,
            childId: CHILD_ID,
            senderId: USER_B,
            recipientId: USER_A,
            kind: 'message',
            body: 'Revisaremos el registro.',
            sentAt: '2026-11-14T09:40:00.000Z',
            readAt: null,
          },
          unreadCount: 1,
        },
      ];

      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify(mockConversations), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await fetchConversations();

      expect(authFetchSpy).toHaveBeenCalledWith('/messages/conversations', undefined);
      expect(result).toHaveLength(1);
      expect(result[0]?.participant.specialty).toBe('nutrition');
      expect(result[0]?.unreadCount).toBe(1);
    });

    it('envia childId como query param cuando se especifica', async () => {
      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await fetchConversations({ childId: CHILD_ID });
      expect(authFetchSpy).toHaveBeenCalledWith(
        `/messages/conversations?childId=${CHILD_ID}`,
        undefined,
      );
    });
  });

  describe('fetchMessages', () => {
    it('consulta GET /messages con childId, withUserId, limit y cursor', async () => {
      const page = {
        items: [
          {
            id: MSG_ID,
            childId: CHILD_ID,
            senderId: USER_B,
            recipientId: USER_A,
            kind: 'message',
            body: 'Hola',
            sentAt: '2026-11-14T09:40:00.000Z',
            readAt: null,
          },
        ],
        nextCursor: null,
      };

      const cursorId = '55555555-5555-4555-8555-555555555555';
      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await fetchMessages({
        childId: CHILD_ID,
        withUserId: USER_B,
        cursor: cursorId,
        limit: 20,
      });

      expect(authFetchSpy).toHaveBeenCalledWith(
        `/messages?childId=${CHILD_ID}&withUserId=${USER_B}&limit=20&cursor=${cursorId}`,
        undefined,
      );
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('lanza MessageApiError con status 403 cuando no hay vinculo', async () => {
      vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Forbidden', message: 'No tienes acceso a este niño' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      await expect(fetchMessages({ childId: CHILD_ID, withUserId: USER_B })).rejects.toMatchObject({
        name: 'MessageApiError',
        status: 403,
        message: 'No tienes acceso a este niño',
      });
    });
  });

  describe('sendMessageApi', () => {
    it('envia POST /messages validado y retorna el mensaje creado', async () => {
      const responseMessage = {
        id: MSG_ID,
        childId: CHILD_ID,
        senderId: USER_A,
        recipientId: USER_B,
        kind: 'message',
        body: 'Buenos días',
        sentAt: '2026-11-14T10:00:00.000Z',
        readAt: null,
      };

      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify(responseMessage), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await sendMessageApi({
        id: MSG_ID,
        childId: CHILD_ID,
        recipientId: USER_B,
        body: 'Buenos días',
      });

      expect(authFetchSpy).toHaveBeenCalledWith('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: MSG_ID,
          childId: CHILD_ID,
          recipientId: USER_B,
          body: 'Buenos días',
        }),
      });
      expect(result.id).toBe(MSG_ID);
    });

    it('lanza MessageNetworkError cuando falla la red', async () => {
      vi.spyOn(apiModule, 'authFetch').mockRejectedValue(new TypeError('Network request failed'));

      await expect(
        sendMessageApi({
          id: MSG_ID,
          childId: CHILD_ID,
          recipientId: USER_B,
          body: 'Hola',
        }),
      ).rejects.toBeInstanceOf(MessageNetworkError);
    });

    it('rechaza mensajes vacios o mayores a 2000 caracteres antes de llamar la API', async () => {
      const authFetchSpy = vi.spyOn(apiModule, 'authFetch');

      await expect(
        sendMessageApi({ id: MSG_ID, childId: CHILD_ID, recipientId: USER_B, body: '   ' }),
      ).rejects.toThrow();

      await expect(
        sendMessageApi({
          id: MSG_ID,
          childId: CHILD_ID,
          recipientId: USER_B,
          body: 'a'.repeat(2001),
        }),
      ).rejects.toThrow();

      expect(authFetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('markThreadReadApi', () => {
    it('envia PATCH /messages/read con childId y withUserId', async () => {
      const authFetchSpy = vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify({ updated: 3 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await markThreadReadApi({ childId: CHILD_ID, withUserId: USER_B });
      expect(authFetchSpy).toHaveBeenCalledWith('/messages/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: CHILD_ID, withUserId: USER_B }),
      });
      expect(result).toEqual({ updated: 3 });
    });
  });

  describe('fetchChildProfessionals & filterActiveProfessionals', () => {
    it('obtiene profesionales vinculados al niño y filtra solo los vigentes hoy', async () => {
      const assignments = [
        {
          id: '66666666-6666-4666-8666-666666666661',
          childId: CHILD_ID,
          professionalId: USER_B,
          specialty: 'nutrition',
          firstName: 'Laura',
          lastName: 'Pérez',
          startDate: '2026-01-01',
          endDate: null,
        },
        {
          id: '66666666-6666-4666-8666-666666666662',
          childId: CHILD_ID,
          professionalId: '77777777-7777-4777-8777-777777777777',
          specialty: 'nursing',
          firstName: 'Ana',
          lastName: 'Torres',
          startDate: '2025-01-01',
          endDate: '2026-06-01',
        },
      ];

      vi.spyOn(apiModule, 'authFetch').mockResolvedValue(
        new Response(JSON.stringify(assignments), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const list = await fetchChildProfessionals(CHILD_ID);
      const active = filterActiveProfessionals(list, '2026-11-14');

      expect(list).toHaveLength(2);
      expect(active).toHaveLength(1);
      expect(active[0]?.professionalId).toBe(USER_B);
    });
  });

  describe('error helpers', () => {
    it('traduce errores de red y 403 en español claro', () => {
      const netErr = new MessageNetworkError();
      expect(isMessageNetworkError(netErr)).toBe(true);
      expect(getMessageErrorMessage(netErr, 'fallback')).toContain('No hay conexión');

      const forbiddenErr = new MessageApiError('', 403);
      expect(isMessageNetworkError(forbiddenErr)).toBe(false);
      expect(getMessageErrorMessage(forbiddenErr, 'fallback')).toContain('No tienes permiso');
    });
  });
});
