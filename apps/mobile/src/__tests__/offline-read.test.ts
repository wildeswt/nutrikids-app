import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/local-db/database.js', () => ({
  getLocalDatabase: vi.fn(async () => {
    throw new Error('SQLCipher unavailable');
  }),
  resetLocalDatabaseForTests: vi.fn(),
}));

import { OfflineNoDataError, classifyLoadError, readThrough } from '../lib/offline-read';

describe('readThrough', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entrega primero la copia local y luego sobrescribe con el servidor', async () => {
    let store = ['local-child'];
    const events: string[] = [];
    const onLocalData = vi.fn((snapshot) => {
      events.push(`local:${snapshot.data.join(',')}`);
    });

    const result = await readThrough({
      operationName: 'children.readThrough',
      checkConnectivity: async () => 'online',
      readLocal: async () => ({
        data: store,
        lastSyncedAt: '2026-11-14T10:00:00.000Z',
      }),
      onLocalData,
      fetchRemote: async () => {
        events.push('remote-fetch');
        return ['remote-child'];
      },
      writeLocal: async (data) => {
        store = data;
        events.push(`write:${data.join(',')}`);
        return '2026-11-14T12:00:00.000Z';
      },
    });

    expect(onLocalData).toHaveBeenCalledWith({
      data: ['local-child'],
      lastSyncedAt: '2026-11-14T10:00:00.000Z',
    });
    expect(events).toEqual(['local:local-child', 'remote-fetch', 'write:remote-child']);
    expect(store).toEqual(['remote-child']);
    expect(result).toEqual({
      data: ['remote-child'],
      fromCache: false,
      stale: false,
      lastSyncedAt: '2026-11-14T12:00:00.000Z',
    });
  });

  it('conserva la copia local y marca stale cuando la red está caída', async () => {
    const fetchRemote = vi.fn(async () => [{ id: 'never' }]);

    const result = await readThrough({
      checkConnectivity: async () => 'offline',
      readLocal: async () => ({
        data: [{ id: 'c1' }],
        lastSyncedAt: '2026-11-14T09:00:00.000Z',
      }),
      fetchRemote,
      writeLocal: async () => '2026-11-14T12:00:00.000Z',
    });

    expect(fetchRemote).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [{ id: 'c1' }],
      fromCache: true,
      stale: true,
      lastSyncedAt: '2026-11-14T09:00:00.000Z',
    });
  });

  it('conserva la copia local ante error de red o 5xx al refrescar', async () => {
    const serverError = Object.assign(new Error('Service Unavailable'), { status: 503 });

    const result5xx = await readThrough({
      checkConnectivity: async () => 'online',
      readLocal: async () => ({ data: ['cached'], lastSyncedAt: '2026-11-14T08:00:00.000Z' }),
      fetchRemote: async () => {
        throw serverError;
      },
      writeLocal: async () => '2026-11-14T12:00:00.000Z',
    });

    expect(result5xx).toEqual({
      data: ['cached'],
      fromCache: true,
      stale: true,
      lastSyncedAt: '2026-11-14T08:00:00.000Z',
    });

    const resultNetwork = await readThrough({
      checkConnectivity: async () => 'online',
      readLocal: async () => ({ data: ['cached'], lastSyncedAt: '2026-11-14T08:00:00.000Z' }),
      fetchRemote: async () => {
        throw new TypeError('Network request failed');
      },
      writeLocal: async () => '2026-11-14T12:00:00.000Z',
    });

    expect(resultNetwork.fromCache).toBe(true);
    expect(resultNetwork.stale).toBe(true);
  });

  it('lanza OfflineNoDataError si no hay conexión ni copia local', async () => {
    await expect(
      readThrough({
        checkConnectivity: async () => 'offline',
        readLocal: async () => null,
        fetchRemote: async () => ['remote'],
        writeLocal: async () => null,
      }),
    ).rejects.toBeInstanceOf(OfflineNoDataError);
  });

  it('propaga error de red o 5xx si no existe copia local', async () => {
    const error = Object.assign(new Error('Bad Gateway'), { status: 502 });

    await expect(
      readThrough({
        checkConnectivity: async () => 'online',
        readLocal: async () => null,
        fetchRemote: async () => {
          throw error;
        },
        writeLocal: async () => null,
      }),
    ).rejects.toBe(error);

    expect(classifyLoadError(new OfflineNoDataError())).toBe('needs-connection');
    expect(classifyLoadError(new TypeError('Network request failed'))).toBe('needs-connection');
    expect(classifyLoadError(error)).toBe('error');
  });

  it('propaga 401 sin tratarlo como offline y no borra copia en 401', async () => {
    const deleteLocal = vi.fn(async () => {});
    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 });

    await expect(
      readThrough({
        checkConnectivity: async () => 'online',
        readLocal: async () => ({ data: ['cached'], lastSyncedAt: '2026-11-14T08:00:00.000Z' }),
        fetchRemote: async () => {
          throw unauthorized;
        },
        writeLocal: async () => null,
        deleteLocal,
      }),
    ).rejects.toBe(unauthorized);

    expect(deleteLocal).not.toHaveBeenCalled();
  });

  it('propaga 403 y 404 y elimina la copia local', async () => {
    for (const status of [403, 404]) {
      const deleteLocal = vi.fn(async () => {});
      const apiError = Object.assign(new Error(`HTTP ${status}`), { status });

      await expect(
        readThrough({
          checkConnectivity: async () => 'online',
          readLocal: async () => ({ data: ['cached'], lastSyncedAt: '2026-11-14T08:00:00.000Z' }),
          fetchRemote: async () => {
            throw apiError;
          },
          writeLocal: async () => null,
          deleteLocal,
        }),
      ).rejects.toBe(apiError);

      expect(deleteLocal).toHaveBeenCalledTimes(1);
    }
  });

  it('degrada elegantemente si falla la lectura o escritura local y registra solo la operación', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readThrough({
      operationName: 'children.readThrough',
      checkConnectivity: async () => 'online',
      readLocal: async () => {
        throw new Error('SQLCipher unavailable: sensitive-child-name');
      },
      fetchRemote: async () => ['fresh-from-server'],
      writeLocal: async () => {
        throw new Error('Disk full: sensitive-data');
      },
    });

    expect(result).toEqual({
      data: ['fresh-from-server'],
      fromCache: false,
      stale: false,
      lastSyncedAt: null,
    });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      '[offline-read] Error de almacenamiento local en children.readThrough.readLocal',
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      '[offline-read] Error de almacenamiento local en children.readThrough.writeLocal',
    );
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('sensitive-');
  });
});
