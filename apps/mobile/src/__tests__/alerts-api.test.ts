import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAlert } from './alerts-fixtures.js';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { formatAlertAge } from '../lib/alert-format.js';
import { ALERT_STATUS_FILTERS, fetchAlerts } from '../lib/alerts-api.js';

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

describe('fetchAlerts', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('requests the open statuses by default and keeps the server order', async () => {
    const first = makeAlert({ id: '22222222-2222-4222-8222-222222222221' });
    const second = makeAlert({ id: '22222222-2222-4222-8222-222222222222', isSevere: false });
    const mock = stubFetch([second, first]);

    const result = await fetchAlerts();

    expect(mock.mock.calls[0]?.[0]).toContain('/alerts?status=GENERATED,PENDING_REVIEW');
    expect(result.map((a) => a.id)).toEqual([second.id, first.id]);
  });

  it('sends the given statuses and childId', async () => {
    const mock = stubFetch([]);
    const childId = '11111111-1111-4111-8111-111111111111';

    await fetchAlerts({ statuses: ALERT_STATUS_FILTERS.ATTENDED, childId });

    expect(mock.mock.calls[0]?.[0]).toContain(
      `/alerts?status=REVIEWED,FOLLOW_UP_ESTABLISHED&childId=${childId}`,
    );
  });

  it('throws the API message when the request fails', async () => {
    stubFetch({ error: 'Forbidden', message: 'Sin permiso para ver alertas' }, 403);
    await expect(fetchAlerts()).rejects.toThrow('Sin permiso para ver alertas');
  });

  it('rejects a response that does not match the shared schema', async () => {
    stubFetch([{ id: 'not-an-alert' }]);
    await expect(fetchAlerts()).rejects.toThrow();
  });
});

describe('formatAlertAge', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');

  it('formats today, yesterday and older alerts', () => {
    expect(formatAlertAge('2026-11-14T08:00:00.000Z', now)).toBe('Hoy');
    expect(formatAlertAge('2026-11-13T08:00:00.000Z', now)).toBe('Ayer');
    expect(formatAlertAge('2026-11-10T08:00:00.000Z', now)).toBe('Hace 4 días');
  });

  it('never shows a negative age for a future timestamp', () => {
    expect(formatAlertAge('2026-11-15T08:00:00.000Z', now)).toBe('Hoy');
  });
});
