import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  ReferralApiError,
  createReferral,
  fetchChildProfessionals,
  fetchMyChildren,
  isReferralForbiddenError,
  isReferralNetworkError,
} from '../lib/referrals-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const RECIPIENT_ID = '22222222-2222-4222-8222-222222222222';
const SENDER_ID = '33333333-3333-4333-8333-333333333333';
const REFERRAL_ID = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const storedReferral = {
  id: REFERRAL_ID,
  childId: CHILD_ID,
  senderId: SENDER_ID,
  recipientId: RECIPIENT_ID,
  kind: 'referral' as const,
  body: '[Prioritaria] Solicito valoración pediátrica.',
  sentAt: '2026-11-14T15:00:00.000Z',
  readAt: null,
};

describe('referrals-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchMyChildren', () => {
    it('requests GET /children and parses the child list', async () => {
      const child = {
        id: CHILD_ID,
        firstName: 'Mateo',
        lastName: 'Rodríguez',
        birthDate: '2023-06-15',
        sex: 'MALE',
      };
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([child]));
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchMyChildren();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/children$/),
        expect.any(Object),
      );
      expect(result).toEqual([child]);
    });
  });

  describe('fetchChildProfessionals', () => {
    it('requests GET /children/:childId/professionals and parses assignments', async () => {
      const assignment = {
        id: ASSIGNMENT_ID,
        childId: CHILD_ID,
        professionalId: RECIPIENT_ID,
        specialty: 'pediatrics',
        firstName: 'Carlos',
        lastName: 'Medina',
        startDate: '2026-01-01',
        endDate: null,
      };
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([assignment]));
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchChildProfessionals(CHILD_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}/professionals`),
        expect.any(Object),
      );
      expect(result).toEqual([assignment]);
    });

    it('throws ReferralApiError with status when the API returns an error', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: 'Forbidden', message: 'No tienes vínculo con este niño' }, 403),
          ),
      );

      const error = await fetchChildProfessionals(CHILD_ID).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ReferralApiError);
      expect(error).toMatchObject({
        status: 403,
        message: 'No tienes vínculo con este niño',
      });
    });

    it('maps network errors to ReferralApiError with status 0', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));

      const error = await fetchChildProfessionals(CHILD_ID).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ReferralApiError);
      expect(error).toMatchObject({ status: 0 });
      expect(isReferralNetworkError(error)).toBe(true);
    });
  });

  describe('createReferral', () => {
    const input = {
      id: REFERRAL_ID,
      childId: CHILD_ID,
      recipientId: RECIPIENT_ID,
      body: '[Prioritaria] Solicito valoración pediátrica.',
    };

    it('sends POST /referrals with validated payload and returns the created referral', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(storedReferral, 201));
      vi.stubGlobal('fetch', mockFetch);

      const result = await createReferral(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/referrals$/),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );
      expect(result).toEqual(storedReferral);
    });

    it('accepts 200 on idempotent retry with the same id', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(storedReferral, 200));
      vi.stubGlobal('fetch', mockFetch);

      await expect(createReferral(input)).resolves.toEqual(storedReferral);
    });

    it('rejects invalid input client-side without calling fetch', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(createReferral({ ...input, body: '   ' })).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('preserves 403 status and message for link/consent/role errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(
            {
              error: 'Forbidden',
              message: 'Solo puedes derivar a otro profesional vinculado al mismo niño',
            },
            403,
          ),
        ),
      );

      const error = await createReferral(input).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ReferralApiError);
      expect(isReferralForbiddenError(error)).toBe(true);
      expect(error).toMatchObject({
        status: 403,
        message: 'Solo puedes derivar a otro profesional vinculado al mismo niño',
      });
    });

    it('falls back to a clear Spanish message on 403 without JSON body', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 })));

      const error = await createReferral(input).catch((err: unknown) => err);

      expect(isReferralForbiddenError(error)).toBe(true);
      expect((error as ReferralApiError).message).toContain('No tienes permiso');
    });

    it('throws network ReferralApiError with status 0 on connection failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));

      const error = await createReferral(input).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ReferralApiError);
      expect(isReferralNetworkError(error)).toBe(true);
      expect((error as ReferralApiError).message).toContain('No hay conexión');
    });
  });
});
