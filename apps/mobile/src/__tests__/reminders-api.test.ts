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

import {
  ReminderApiError,
  completeReminder,
  createReminder,
  fetchReminders,
  isReminderConsentError,
} from '../lib/reminders-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';

const storedReminder = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: CHILD_ID,
  type: 'checkup',
  scheduledFor: '2026-11-20T14:00:00.000Z',
  status: 'pending',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('reminders-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchReminders', () => {
    it('requests GET /reminders without filters and parses the list', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([storedReminder]));
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchReminders();

      const [url] = mockFetch.mock.calls[0]!;
      expect(String(url).endsWith('/reminders')).toBe(true);
      expect(result).toEqual([storedReminder]);
    });

    it('sends the childId and status filters as query parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
      vi.stubGlobal('fetch', mockFetch);

      await fetchReminders({ childId: CHILD_ID, status: 'completed' });

      expect(String(mockFetch.mock.calls[0]![0])).toContain(
        `/reminders?childId=${CHILD_ID}&status=completed`,
      );
    });

    it('throws the API message with its status when the request fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden', message: 'Sin acceso' }, 403)),
      );

      const error = await fetchReminders().catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ReminderApiError);
      expect(error).toMatchObject({ message: 'Sin acceso', status: 403 });
    });

    it('falls back to a translated message when the error body is not JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

      await expect(fetchReminders()).rejects.toThrow(
        'No pudimos cargar los recordatorios. Intenta de nuevo.',
      );
    });
  });

  describe('createReminder', () => {
    const input = {
      id: storedReminder.id,
      childId: CHILD_ID,
      type: 'checkup' as const,
      scheduledFor: storedReminder.scheduledFor,
    };

    it('sends POST /reminders with the validated body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(storedReminder, 201));
      vi.stubGlobal('fetch', mockFetch);

      const result = await createReminder(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/reminders'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
      );
      expect(result).toEqual(storedReminder);
    });

    it('rejects client-side the type reserved for the server', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(createReminder({ ...input, type: 'next_checkup' as never })).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('recognises the missing-consent rejection (403 mentioning the consent)', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: 'Forbidden', message: 'El niño no tiene consentimiento vigente' },
              403,
            ),
          ),
      );

      const error = await createReminder(input).catch((err: unknown) => err);

      expect(isReminderConsentError(error)).toBe(true);
      expect(isReminderConsentError(new ReminderApiError('No tienes acceso', 403))).toBe(false);
      expect(isReminderConsentError(new Error('consentimiento'))).toBe(false);
    });
  });

  describe('completeReminder', () => {
    it('sends PATCH /reminders/:id/complete and returns the updated reminder', async () => {
      const completed = { ...storedReminder, status: 'completed' };
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(completed));
      vi.stubGlobal('fetch', mockFetch);

      const result = await completeReminder(storedReminder.id);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/reminders/${storedReminder.id}/complete`),
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(result.status).toBe('completed');
    });

    it('throws when the reminder does not exist', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ error: 'Not Found', message: 'No existe' }, 404)),
      );

      await expect(completeReminder(storedReminder.id)).rejects.toMatchObject({
        message: 'No existe',
        status: 404,
      });
    });
  });
});
