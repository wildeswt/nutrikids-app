import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHILD_ID, makeCheckup, makeDetail } from './alerts-fixtures.js';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { fetchAlertDetail, updateAlertStatus } from '../lib/alerts-api.js';
import { fetchProfessionalCheckups } from '../lib/checkups-api.js';
import { fetchChild } from '../lib/children-api.js';

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('alert detail API clients (NK-33)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  describe('fetchAlertDetail', () => {
    it('requests the alert and returns it with the full history', async () => {
      const detail = makeDetail();
      const mock = stubFetch(detail);

      const result = await fetchAlertDetail(detail.id);

      expect(mock.mock.calls[0]?.[0]).toContain(`/alerts/${detail.id}`);
      expect(result.history.map((h) => h.changedByName)).toEqual(['Laura Pérez', 'Carlos Sánchez']);
    });

    it('rejects a history entry without the name of who made the change', async () => {
      const detail = makeDetail();
      const { changedByName: _name, ...withoutName } = detail.history[0]!;
      stubFetch({ ...detail, history: [withoutName] });
      await expect(fetchAlertDetail(detail.id)).rejects.toThrow();
    });

    it('throws the API message when the alert is hidden or forbidden', async () => {
      stubFetch({ error: 'Not Found', message: 'Alerta no encontrada' }, 404);
      await expect(fetchAlertDetail(makeDetail().id)).rejects.toThrow('Alerta no encontrada');
    });

    it('falls back to a translated message when the error body is not JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));
      await expect(fetchAlertDetail(makeDetail().id)).rejects.toThrow(
        'No pudimos cargar la alerta. Intenta de nuevo.',
      );
    });
  });

  describe('updateAlertStatus', () => {
    it('sends the new status with PATCH and returns the updated detail', async () => {
      const detail = makeDetail({ status: 'REVIEWED' });
      const mock = stubFetch(detail);

      const result = await updateAlertStatus(detail.id, 'REVIEWED');

      expect(mock.mock.calls[0]?.[0]).toContain(`/alerts/${detail.id}/status`);
      const init = mock.mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({ status: 'REVIEWED' });
      expect(result.status).toBe('REVIEWED');
    });

    it('throws the API message when the transition is not valid (409)', async () => {
      stubFetch({ error: 'Conflict', message: 'Transición no permitida' }, 409);
      await expect(updateAlertStatus(makeDetail().id, 'REVIEWED')).rejects.toThrow(
        'Transición no permitida',
      );
    });
  });

  describe('fetchProfessionalCheckups', () => {
    it('requests the full history and keeps the technical results', async () => {
      const mock = stubFetch([makeCheckup({}, -2.2)]);

      const [checkup] = await fetchProfessionalCheckups(CHILD_ID);

      expect(mock.mock.calls[0]?.[0]).toContain(`/children/${CHILD_ID}/checkups`);
      expect(mock.mock.calls[0]?.[0]).not.toContain('onlyCurrent');
      expect(checkup?.results).toHaveLength(4);
      expect(checkup?.results[0]?.zScore).toBe(-2.2);
    });

    it('rejects checkups without results (the caregiver shape)', async () => {
      const { results: _results, ...caregiverShape } = makeCheckup();
      stubFetch([caregiverShape]);
      await expect(fetchProfessionalCheckups(CHILD_ID)).rejects.toThrow();
    });

    it('throws the API message with its status', async () => {
      stubFetch({ error: 'Forbidden', message: 'No tienes acceso' }, 403);
      await expect(fetchProfessionalCheckups(CHILD_ID)).rejects.toMatchObject({
        message: 'No tienes acceso',
        status: 403,
      });
    });
  });

  describe('fetchChild', () => {
    const child = {
      id: CHILD_ID,
      firstName: 'Mateo',
      lastName: 'Gómez',
      birthDate: '2023-06-15',
      sex: 'MALE',
    };

    it('returns the child', async () => {
      const mock = stubFetch(child);
      await expect(fetchChild(CHILD_ID)).resolves.toEqual(child);
      expect(mock.mock.calls[0]?.[0]).toContain(`/children/${CHILD_ID}`);
    });

    it('throws the API message on error', async () => {
      stubFetch({ error: 'Not Found', message: 'Niño no encontrado' }, 404);
      await expect(fetchChild(CHILD_ID)).rejects.toThrow('Niño no encontrado');
    });
  });
});
