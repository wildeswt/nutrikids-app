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
  FeedingApiError,
  createChildFeedingLog,
  isConsentRequiredError,
  isFeedingNetworkError,
} from '../lib/feeding-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';

const storedFeedingLog = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: CHILD_ID,
  logDate: '2026-10-18',
  mealsPerDay: 4,
  details: 'Comidas: Desayuno, Merienda am, Almuerzo, Cena. Arroz con pollo',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('feeding-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createChildFeedingLog', () => {
    const input = {
      id: storedFeedingLog.id,
      logDate: storedFeedingLog.logDate,
      mealsPerDay: 4,
      details: storedFeedingLog.details,
    };

    it('sends POST /children/:childId/feeding-logs and parses 201 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(storedFeedingLog, 201));
      vi.stubGlobal('fetch', mockFetch);

      const result = await createChildFeedingLog(CHILD_ID, input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}/feeding-logs`),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
      );
      expect(result).toEqual(storedFeedingLog);
    });

    it('accepts 200 for an idempotent retry with the same id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(storedFeedingLog, 200)));

      await expect(createChildFeedingLog(CHILD_ID, input)).resolves.toEqual(storedFeedingLog);
    });

    it('accepts omitted details and nullable details in the response', async () => {
      const noDetailsResponse = { ...storedFeedingLog, details: null };
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(noDetailsResponse, 201));
      vi.stubGlobal('fetch', mockFetch);

      const result = await createChildFeedingLog(CHILD_ID, {
        id: storedFeedingLog.id,
        logDate: storedFeedingLog.logDate,
        mealsPerDay: 2,
      });

      expect(result).toEqual(noDetailsResponse);
    });

    it('rejects invalid input client-side without calling fetch', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        createChildFeedingLog(CHILD_ID, { ...input, mealsPerDay: 13 }),
      ).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws FeedingApiError with status and message on 400/403 API errors', async () => {
      const payload = {
        error: 'Bad Request',
        message: 'La fecha del registro no puede ser futura',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload, 400)));

      const error = await createChildFeedingLog(CHILD_ID, input).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(FeedingApiError);
      expect(error).toMatchObject({
        name: 'FeedingApiError',
        status: 400,
        isNetwork: false,
        message: 'La fecha del registro no puede ser futura',
      });
    });

    it('falls back to a Spanish message when error payload is not JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

      await expect(createChildFeedingLog(CHILD_ID, input)).rejects.toThrow(
        'No pudimos guardar la alimentación. Intenta de nuevo.',
      );
    });

    it('maps fetch rejections to FeedingApiError with offline Spanish message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));

      const error = await createChildFeedingLog(CHILD_ID, input).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(FeedingApiError);
      expect(error).toMatchObject({
        status: 0,
        isNetwork: true,
        message:
          'Necesitas conexión para guardar la alimentación. Inténtalo de nuevo cuando vuelvas a tener internet.',
      });
    });
  });

  describe('error helpers', () => {
    it('detects 403 consent-required errors and ignores other errors', () => {
      expect(
        isConsentRequiredError(
          new FeedingApiError(
            'El niño no cuenta con un consentimiento informado vigente para registrar datos',
            403,
          ),
        ),
      ).toBe(true);
      const noAccess = new FeedingApiError('No tienes acceso a este niño', 403);
      expect(isConsentRequiredError(noAccess)).toBe(false);
      expect(isConsentRequiredError(new FeedingApiError('Falta consentimiento', 400))).toBe(false);
      expect(isConsentRequiredError(new Error('consentimiento'))).toBe(false);
    });

    it('detects network errors and ignores API HTTP errors', () => {
      const offline = new FeedingApiError('offline', 0, { isNetwork: true });
      expect(isFeedingNetworkError(offline)).toBe(true);
      expect(isFeedingNetworkError(new TypeError('Failed to fetch'))).toBe(true);
      const apiErr = new FeedingApiError('Error de red en payload', 400);
      expect(isFeedingNetworkError(apiErr)).toBe(false);
    });
  });
});
