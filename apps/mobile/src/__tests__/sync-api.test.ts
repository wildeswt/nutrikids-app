import type { SyncCheckupItem, SyncCheckupsResponse } from '@nutrikids/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthFetch = vi.fn<typeof fetch>();

vi.mock('../lib/api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    authFetch: (input: string, init?: RequestInit) => mockAuthFetch(input, init),
  };
});

import { SyncApiError, isRetryableSyncError, postSyncCheckups } from '../lib/sync/sync-api.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const CHECKUP_ID = '33333333-3333-4333-8333-333333333333';

function makeSyncItem(id: string = CHECKUP_ID): SyncCheckupItem {
  return {
    id,
    childId: CHILD_ID,
    measuredAt: '2026-11-14T10:00:00.000Z',
    weightKg: 12.5,
    lengthHeightCm: 88,
    position: 'STANDING',
    notes: 'Control normal',
  };
}

function makeServerCheckupResponse(id: string = CHECKUP_ID) {
  return {
    id,
    childId: CHILD_ID,
    measuredAt: '2026-11-14T10:00:00.000Z',
    weightKg: 12.5,
    lengthHeightCm: 88,
    position: 'STANDING' as const,
    origin: 'CAREGIVER' as const,
    recordedById: USER_ID,
    recordedBy: null,
    correctedCheckupId: null,
    isCurrent: true,
    notes: 'Control normal',
    createdAt: '2026-11-14T10:05:00.000Z',
  };
}

describe('sync-api', () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
  });

  it('envía POST /sync/checkups validando entrada y salida con esquemas compartidos', async () => {
    const serverResponse: SyncCheckupsResponse = {
      results: [
        {
          id: CHECKUP_ID,
          status: 'CREATED',
          checkup: makeServerCheckupResponse(),
        },
      ],
    };

    mockAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(serverResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const item = makeSyncItem();
    const result = await postSyncCheckups([item]);

    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    expect(mockAuthFetch).toHaveBeenCalledWith('/sync/checkups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkups: [item] }),
    });
    expect(result).toEqual(serverResponse);
  });

  it('rechaza lotes vacíos o mayores a 100 elementos antes de llamar la red', async () => {
    await expect(postSyncCheckups([])).rejects.toThrow();

    const oversized = Array.from({ length: 101 }, () => makeSyncItem());
    await expect(postSyncCheckups(oversized)).rejects.toThrow();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('clasifica errores de red (TypeError) como transitorios reintentables', async () => {
    mockAuthFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(postSyncCheckups([makeSyncItem()])).rejects.toMatchObject({
      name: 'SyncApiError',
      kind: 'network',
      status: null,
      retryable: true,
    });
  });

  it('clasifica HTTP 5xx, 408 y 429 como errores reintentables', async () => {
    for (const status of [500, 502, 503, 408, 429]) {
      mockAuthFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: `Error ${status}` }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(postSyncCheckups([makeSyncItem()])).rejects.toMatchObject({
        name: 'SyncApiError',
        kind: 'retryable-http',
        status,
        retryable: true,
      });
    }
  });

  it('clasifica HTTP 4xx del lote entero (400, 403) como no reintentables', async () => {
    for (const status of [400, 403]) {
      mockAuthFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Forbidden', message: 'Sin permiso para sincronizar' }),
          {
            status,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      await expect(postSyncCheckups([makeSyncItem()])).rejects.toMatchObject({
        name: 'SyncApiError',
        kind: 'batch-4xx',
        status,
        retryable: false,
        message: 'Sin permiso para sincronizar',
      });
    }
  });

  it('rechaza respuestas 200 que no cumplen SyncCheckupsResponseSchema', async () => {
    mockAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(postSyncCheckups([makeSyncItem()])).rejects.toMatchObject({
      name: 'SyncApiError',
      kind: 'invalid-response',
      retryable: true,
    });
  });

  it('isRetryableSyncError distingue errores de red/5xx de errores 4xx', () => {
    expect(isRetryableSyncError(new TypeError('Failed to fetch'))).toBe(true);
    expect(
      isRetryableSyncError(
        new SyncApiError('timeout', { kind: 'retryable-http', status: 408, retryable: true }),
      ),
    ).toBe(true);
    expect(isRetryableSyncError(Object.assign(new Error('Down'), { status: 503 }))).toBe(true);
    expect(isRetryableSyncError(Object.assign(new Error('Rate limit'), { status: 429 }))).toBe(
      true,
    );
    expect(isRetryableSyncError(Object.assign(new Error('Bad Request'), { status: 400 }))).toBe(
      false,
    );
    expect(
      isRetryableSyncError(
        new SyncApiError('bad', { kind: 'batch-4xx', status: 403, retryable: false }),
      ),
    ).toBe(false);
  });
});
