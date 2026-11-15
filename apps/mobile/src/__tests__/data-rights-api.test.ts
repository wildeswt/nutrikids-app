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
  DataRightsApiError,
  cancelErasureRequest,
  fetchChildExport,
  fetchErasureRequests,
  isIdentityLockedError,
  isNotLegalRepresentativeError,
  rectifyChild,
  removeChild,
  requestErasure,
} from '../lib/data-rights-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

const child = {
  id: CHILD_ID,
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE',
};

const erasureRequest = {
  id: REQUEST_ID,
  childId: CHILD_ID,
  status: 'pending',
  requestedAt: '2026-11-14T10:00:00.000Z',
  dueAt: '2026-11-29T10:00:00.000Z',
  resolvedAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('data-rights-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('rectifyChild', () => {
    it('sends PATCH /children/:childId with only the given fields', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(jsonResponse({ ...child, firstName: 'Mateo José' }));
      vi.stubGlobal('fetch', mockFetch);

      const result = await rectifyChild(CHILD_ID, { firstName: 'Mateo José' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}`),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ firstName: 'Mateo José' }),
        }),
      );
      expect(result.firstName).toBe('Mateo José');
    });

    it('rejects client-side an empty change or unknown fields', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(rectifyChild(CHILD_ID, {})).rejects.toThrow();
      await expect(rectifyChild(CHILD_ID, { weight: 12 } as never)).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('tells apart "not the legal representative" (403) and "child has checkups" (409)', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse({ error: 'Forbidden', message: 'No eres el representante' }, 403),
          )
          .mockResolvedValueOnce(
            jsonResponse({ error: 'Conflict', message: 'Ya tiene controles' }, 409),
          ),
      );

      const forbidden = await rectifyChild(CHILD_ID, { sex: 'FEMALE' }).catch(
        (err: unknown) => err,
      );
      const locked = await rectifyChild(CHILD_ID, { sex: 'FEMALE' }).catch((err: unknown) => err);

      expect(forbidden).toBeInstanceOf(DataRightsApiError);
      expect(forbidden).toMatchObject({ message: 'No eres el representante', status: 403 });
      expect(isNotLegalRepresentativeError(forbidden)).toBe(true);
      expect(isIdentityLockedError(forbidden)).toBe(false);
      expect(isIdentityLockedError(locked)).toBe(true);
      expect(isNotLegalRepresentativeError(new Error('403'))).toBe(false);
    });

    it('falls back to a translated message when the error body is not JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

      await expect(rectifyChild(CHILD_ID, { firstName: 'Ana' })).rejects.toThrow(
        'No pudimos guardar los cambios. Intenta de nuevo.',
      );
    });
  });

  describe('fetchChildExport', () => {
    const exportBody = {
      exportedAt: '2026-11-14T10:00:00.000Z',
      child,
      caregivers: [{ name: 'Andrea Silva', email: 'a@example.com' }],
      checkups: [
        {
          id: 'c1',
          measuredAt: '2026-10-01T15:00:00.000Z',
          weightKg: '13.4',
          lengthHeightCm: '91.5',
          position: 'STANDING',
          origin: 'CAREGIVER',
          correctedCheckupId: null,
          results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: '-1.2' }],
        },
      ],
      feedingLogs: [],
    };

    it('requests GET /children/:childId/export and keeps only what the app reads', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(exportBody));
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchChildExport(CHILD_ID);

      expect(String(mockFetch.mock.calls[0]![0])).toContain(`/children/${CHILD_ID}/export`);
      expect(result.checkups).toHaveLength(1);
      expect(result.checkups[0]).not.toHaveProperty('results');
      expect(result).not.toHaveProperty('caregivers');
    });

    it('throws a 403 error for a caregiver who is not the legal representative', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(jsonResponse({ error: 'Forbidden', message: 'Sin permiso' }, 403)),
      );

      const error = await fetchChildExport(CHILD_ID).catch((err: unknown) => err);

      expect(isNotLegalRepresentativeError(error)).toBe(true);
    });
  });

  describe('erasure requests', () => {
    it('requestErasure sends POST …/erasure-requests and parses the request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(erasureRequest, 201));
      vi.stubGlobal('fetch', mockFetch);

      const result = await requestErasure(CHILD_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}/erasure-requests`),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual(erasureRequest);
    });

    it('requestErasure reports the 409 of a request that is already pending', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: 'Conflict', message: 'Ya existe una solicitud' }, 409),
          ),
      );

      await expect(requestErasure(CHILD_ID)).rejects.toMatchObject({
        message: 'Ya existe una solicitud',
        status: 409,
      });
    });

    it('fetchErasureRequests lists the history', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([erasureRequest]));
      vi.stubGlobal('fetch', mockFetch);

      await expect(fetchErasureRequests(CHILD_ID)).resolves.toEqual([erasureRequest]);
      expect(String(mockFetch.mock.calls[0]![0])).toContain(
        `/children/${CHILD_ID}/erasure-requests`,
      );
    });

    it('fetchErasureRequests answers 403 to someone who is not the legal representative', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(jsonResponse({ error: 'Forbidden', message: 'Sin permiso' }, 403)),
      );

      const error = await fetchErasureRequests(CHILD_ID).catch((err: unknown) => err);

      expect(isNotLegalRepresentativeError(error)).toBe(true);
    });

    it('cancelErasureRequest sends DELETE …/erasure-requests/:requestId', async () => {
      const cancelled = {
        ...erasureRequest,
        status: 'cancelled',
        resolvedAt: '2026-11-15T10:00:00.000Z',
      };
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(cancelled));
      vi.stubGlobal('fetch', mockFetch);

      const result = await cancelErasureRequest(CHILD_ID, REQUEST_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}/erasure-requests/${REQUEST_ID}`),
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(result.status).toBe('cancelled');
    });
    it('removeChild sends DELETE /children/:childId and fails with the API status', async () => {
      const ok = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', ok);
      await removeChild(CHILD_ID);
      expect(ok).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}`),
        expect.objectContaining({ method: 'DELETE' }),
      );

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'no' } }, 403)),
      );
      const error = await removeChild(CHILD_ID).catch((err: unknown) => err);
      expect(isNotLegalRepresentativeError(error)).toBe(true);
    });
  });
});
