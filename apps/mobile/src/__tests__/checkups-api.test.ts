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
  CheckupApiError,
  correctChildCheckup,
  createChildCheckup,
  deleteChildCheckup,
  fetchChildCheckups,
  isConsentRequiredError,
} from '../lib/checkups-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';

const storedCheckup = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: CHILD_ID,
  measuredAt: '2026-11-10T15:00:00.000Z',
  weightKg: 13.4,
  lengthHeightCm: 91.5,
  position: 'STANDING',
  origin: 'CAREGIVER',
  recordedById: '33333333-3333-4333-8333-333333333333',
  recordedBy: null,
  correctedCheckupId: null,
  isCurrent: true,
  notes: null,
  createdAt: '2026-11-10T15:00:01.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('checkups-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchChildCheckups', () => {
    it('requests only the current checkups of the child and parses the list', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([storedCheckup]));
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchChildCheckups(CHILD_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}/checkups?onlyCurrent=true`),
        expect.any(Object),
      );
      expect(result).toEqual([storedCheckup]);
    });

    it('returns an empty list when the child has no checkups yet', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])));
      await expect(fetchChildCheckups(CHILD_ID)).resolves.toEqual([]);
    });

    it('never exposes technical results to the caregiver (RF-14)', async () => {
      const withResults = {
        ...storedCheckup,
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: -1.2, classification: 'NORMAL' }],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([withResults])));

      const [checkup] = await fetchChildCheckups(CHILD_ID);

      expect(checkup).not.toHaveProperty('results');
    });

    it('throws the API message with its status when the request fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: 'Forbidden', message: 'No tienes acceso' }, 403),
          ),
      );

      const error = await fetchChildCheckups(CHILD_ID).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(CheckupApiError);
      expect(error).toMatchObject({ message: 'No tienes acceso', status: 403 });
    });

    it('falls back to a translated message when the error body is not JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

      await expect(fetchChildCheckups(CHILD_ID)).rejects.toThrow(
        'No pudimos cargar los controles. Intenta de nuevo.',
      );
    });
  });

  describe('createChildCheckup', () => {
    const input = {
      id: storedCheckup.id,
      measuredAt: storedCheckup.measuredAt,
      weightKg: 13.4,
      lengthHeightCm: 91.5,
      position: 'STANDING' as const,
    };

    it('sends POST /children/:childId/checkups with the validated body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(storedCheckup, 201));
      vi.stubGlobal('fetch', mockFetch);

      const result = await createChildCheckup(CHILD_ID, input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}/checkups`),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
      );
      expect(result).toEqual(storedCheckup);
    });

    it('sends notes when provided and returns stored notes', async () => {
      const withNotes = { ...storedCheckup, notes: 'Buen apetito hoy' };
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(withNotes, 201));
      vi.stubGlobal('fetch', mockFetch);

      const payload = { ...input, notes: 'Buen apetito hoy' };
      const result = await createChildCheckup(CHILD_ID, payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${CHILD_ID}/checkups`),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
      );
      expect(result.notes).toBe('Buen apetito hoy');
    });

    it('sends confirmOutlier for atypical values', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(storedCheckup, 201));
      vi.stubGlobal('fetch', mockFetch);

      await createChildCheckup(CHILD_ID, { ...input, weightKg: 35, confirmOutlier: true });

      const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
      expect(body).toMatchObject({ weightKg: 35, confirmOutlier: true });
    });

    it('rejects client-side an atypical value that was not confirmed', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(createChildCheckup(CHILD_ID, { ...input, weightKg: 35 })).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('accepts the 200 answer for an id that was already saved (idempotent retry)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(storedCheckup, 200)));
      await expect(createChildCheckup(CHILD_ID, input)).resolves.toEqual(storedCheckup);
    });

    it('throws a CheckupApiError with the status and message of the API', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: 'Bad Request', message: 'La fecha del control no puede estar en el futuro' },
              400,
            ),
          ),
      );

      const error = await createChildCheckup(CHILD_ID, input).catch((err: unknown) => err);

      expect(error).toMatchObject({
        name: 'CheckupApiError',
        status: 400,
        message: 'La fecha del control no puede estar en el futuro',
      });
    });
  });

  describe('isConsentRequiredError', () => {
    it('detects the 403 sent when the child has no active consent', () => {
      const error = new CheckupApiError(
        'El niño no cuenta con un consentimiento informado vigente para registrar datos',
        403,
      );
      expect(isConsentRequiredError(error)).toBe(true);
    });

    it('ignores other 403 errors and other statuses', () => {
      expect(isConsentRequiredError(new CheckupApiError('No tienes acceso a este niño', 403))).toBe(
        false,
      );
      expect(
        isConsentRequiredError(new CheckupApiError('Falta el consentimiento (dato inválido)', 400)),
      ).toBe(false);
      expect(isConsentRequiredError(new Error('consentimiento'))).toBe(false);
    });
  });
  describe('correctChildCheckup and deleteChildCheckup', () => {
    it('corrects with POST /checkups/:id/correction', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(storedCheckup), { status: 201 }));
      vi.stubGlobal('fetch', mockFetch);

      await correctChildCheckup(storedCheckup.id, {
        id: '44444444-4444-4444-8444-444444444444',
        measuredAt: storedCheckup.measuredAt,
        weightKg: 13.2,
        lengthHeightCm: 91.5,
        position: 'STANDING',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/checkups/${storedCheckup.id}/correction`),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('deletes with DELETE /checkups/:id and throws the API status on failure', async () => {
      const ok = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', ok);
      await deleteChildCheckup(storedCheckup.id);
      expect(ok).toHaveBeenCalledWith(
        expect.stringContaining(`/checkups/${storedCheckup.id}`),
        expect.objectContaining({ method: 'DELETE' }),
      );

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 403 })),
      );
      const error = await deleteChildCheckup(storedCheckup.id).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(CheckupApiError);
      expect((error as CheckupApiError).status).toBe(403);
    });
  });
});
