import type { CheckupResponse, SyncCheckupItem, SyncCheckupsResponse } from '@nutrikids/shared';
import type { AppStateStatus } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectivityStatus } from '../lib/connectivity.js';
import { checkupsRepository, runMigrations, syncQueueRepository } from '../lib/local-db/index.js';
import { computeBackoffMs } from '../lib/sync/backoff.js';
import { SyncApiError } from '../lib/sync/sync-api.js';
import {
  createSyncEngine,
  flushCheckupQueue,
  type PostSyncCheckupsFn,
  type SyncState,
} from '../lib/sync/sync-engine.js';
import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '99999999-9999-4999-8999-999999999999';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const NOW_ISO = '2026-11-14T15:00:00.000Z';

function makeUuid(index: number): string {
  const hex = index.toString(16).padStart(12, '0');
  return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
}

function makeCheckupItem(id: string, overrides: Partial<SyncCheckupItem> = {}): SyncCheckupItem {
  return {
    id,
    childId: CHILD_ID,
    measuredAt: '2026-11-14T14:00:00.000Z',
    weightKg: 13.2,
    lengthHeightCm: 91.5,
    position: 'STANDING',
    notes: 'Control en casa',
    ...overrides,
  };
}

function makeServerCheckup(item: SyncCheckupItem, recordedById: string = USER_A): CheckupResponse {
  return {
    id: item.id,
    childId: item.childId,
    measuredAt: item.measuredAt,
    weightKg: item.weightKg,
    lengthHeightCm: item.lengthHeightCm,
    position: item.position,
    origin: 'PROFESSIONAL',
    recordedById,
    recordedBy: {
      userId: recordedById,
      firstName: 'Ana',
      lastName: 'Ruiz',
      role: 'PROFESSIONAL',
      specialty: 'pediatrics',
    },
    correctedCheckupId: null,
    isCurrent: true,
    notes: item.notes ?? null,
    createdAt: '2026-11-14T14:30:00.000Z',
    results: [
      {
        id: makeUuid(9000),
        checkupId: item.id,
        indicator: 'WEIGHT_FOR_AGE',
        zScore: 0.15,
        percentile: 56,
        classification: 'NORMAL',
        referenceVersion: 'WHO-2006',
      },
    ],
  };
}

async function seedPendingCheckup(
  db: SqliteTestDb,
  userId: string,
  item: SyncCheckupItem,
  nextAttemptAt: string | null = null,
): Promise<void> {
  await checkupsRepository.insertLocal(db, userId, item);
  await syncQueueRepository.enqueue(db, userId, {
    id: item.id,
    kind: 'checkup',
    payload: item,
    nextAttemptAt,
  });
}

describe('sync-engine', () => {
  let db: SqliteTestDb;

  beforeEach(async () => {
    db = createSqliteTestDb();
    await runMigrations(db);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it('procesa lote mixto con CREATED, DUPLICATE y ERROR 4xx por ítem', async () => {
    const idCreated = makeUuid(1);
    const idDuplicate = makeUuid(2);
    const idError = makeUuid(3);

    const itemCreated = makeCheckupItem(idCreated);
    const itemDuplicate = makeCheckupItem(idDuplicate, { weightKg: 14.1 });
    const itemError = makeCheckupItem(idError, { weightKg: 15.0 });

    await seedPendingCheckup(db, USER_A, itemCreated);
    await seedPendingCheckup(db, USER_A, itemDuplicate);
    await seedPendingCheckup(db, USER_A, itemError);

    const serverCreated = makeServerCheckup({ ...itemCreated, notes: 'Recalculado' });
    const serverDuplicate = makeServerCheckup(itemDuplicate);

    const post = vi.fn<PostSyncCheckupsFn>(async () => ({
      results: [
        { id: idCreated, status: 'CREATED', checkup: serverCreated },
        { id: idDuplicate, status: 'DUPLICATE', checkup: serverDuplicate },
        {
          id: idError,
          status: 'ERROR',
          error: { status: 403, message: 'No tienes acceso a este niño' },
        },
      ],
    }));

    const summary = await flushCheckupQueue({ db, userId: USER_A, now: NOW_ISO, post });

    expect(summary).toEqual({
      attempted: 3,
      synced: 2,
      failedPermanent: 1,
      deferredRetry: 0,
      batches: 1,
    });

    const sentQueue = await syncQueueRepository.listByStatus(db, USER_A, 'SENT');
    expect(sentQueue.map((r) => r.id)).toEqual([idCreated, idDuplicate]);

    const errorQueue = await syncQueueRepository.listByStatus(db, USER_A, 'ERROR');
    expect(errorQueue).toHaveLength(1);
    expect(errorQueue[0]?.id).toBe(idError);
    expect(errorQueue[0]?.lastError).toBe('No tienes acceso a este niño');
    expect(errorQueue[0]?.nextAttemptAt).toBeNull();

    // Verifica sobrescritura en `checkups` con los valores recalculados del servidor y sync_state = 'SENT'.
    const entries = await checkupsRepository.listEntriesByChild(db, USER_A, CHILD_ID);
    const createdEntry = entries.find((e) => e.checkup.id === idCreated);
    const duplicateEntry = entries.find((e) => e.checkup.id === idDuplicate);
    const errorEntry = entries.find((e) => e.checkup.id === idError);

    expect(createdEntry?.syncState).toBe('SENT');
    expect(createdEntry?.checkup).toEqual(serverCreated);
    expect(duplicateEntry?.syncState).toBe('SENT');
    expect(duplicateEntry?.checkup).toEqual(serverDuplicate);
    expect(errorEntry?.syncState).toBe('LOCAL');

    // Un ERROR 4xx definitivo no se reintenta automáticamente ni con ignoreSchedule.
    post.mockClear();
    const secondRun = await flushCheckupQueue({
      db,
      userId: USER_A,
      now: '2026-11-14T16:00:00.000Z',
      post,
      ignoreSchedule: true,
    });
    expect(secondRun.attempted).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('trata una respuesta ilegible (p. ej. portal cautivo) como reintentable, no como error', async () => {
    const id = makeUuid(11);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id));

    const post = vi.fn<PostSyncCheckupsFn>(async () => {
      throw new SyncApiError('Respuesta inválida', {
        kind: 'invalid-response',
        status: 200,
        retryable: true,
      });
    });

    const summary = await flushCheckupQueue({ db, userId: USER_A, now: NOW_ISO, post });

    expect(summary.failedPermanent).toBe(0);
    expect(summary.deferredRetry).toBe(1);
    expect(await syncQueueRepository.listByStatus(db, USER_A, 'ERROR')).toHaveLength(0);
    expect(await syncQueueRepository.listByStatus(db, USER_A, 'LOCAL')).toHaveLength(1);
  });

  it('vuelve a LOCAL con attempts + 1 y next_attempt_at ante error de red del lote', async () => {
    const id = makeUuid(10);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id));

    const post = vi.fn<PostSyncCheckupsFn>(async () => {
      throw new TypeError('Network request failed');
    });

    const summary = await flushCheckupQueue({
      db,
      userId: USER_A,
      now: NOW_ISO,
      post,
      random: () => 0.5,
    });

    expect(summary).toEqual({
      attempted: 1,
      synced: 0,
      failedPermanent: 0,
      deferredRetry: 1,
      batches: 1,
    });

    const localItems = await syncQueueRepository.listByStatus(db, USER_A, 'LOCAL');
    expect(localItems).toHaveLength(1);
    expect(localItems[0]?.attempts).toBe(1);

    const expectedNext = new Date(
      Date.parse(NOW_ISO) + computeBackoffMs(0, () => 0.5),
    ).toISOString();
    expect(localItems[0]?.nextAttemptAt).toBe(expectedNext);

    // Antes de vencer next_attempt_at no vuelve a enviarse en un ciclo normal.
    post.mockClear();
    const earlyRun = await flushCheckupQueue({
      db,
      userId: USER_A,
      now: new Date(Date.parse(NOW_ISO) + 500).toISOString(),
      post,
    });
    expect(earlyRun.attempted).toBe(0);
    expect(post).not.toHaveBeenCalled();

    // Al vencer next_attempt_at, vuelve a intentar y avanza a attempts = 2 si falla de nuevo.
    const dueRun = await flushCheckupQueue({
      db,
      userId: USER_A,
      now: expectedNext,
      post,
      random: () => 0.5,
    });
    expect(dueRun.deferredRetry).toBe(1);

    const updatedItems = await syncQueueRepository.listByStatus(db, USER_A, 'LOCAL');
    expect(updatedItems[0]?.attempts).toBe(2);
    expect(updatedItems[0]?.nextAttemptAt).toBe(
      new Date(Date.parse(expectedNext) + computeBackoffMs(1, () => 0.5)).toISOString(),
    );
  });

  it('marca ERROR permanente cuando el lote entero recibe HTTP 4xx (p. ej. 403)', async () => {
    const id = makeUuid(11);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id));

    const post = vi.fn<PostSyncCheckupsFn>(async () => {
      throw new SyncApiError('No tienes permiso para registrar controles', {
        kind: 'batch-4xx',
        status: 403,
        retryable: false,
      });
    });

    const summary = await flushCheckupQueue({ db, userId: USER_A, now: NOW_ISO, post });
    expect(summary.failedPermanent).toBe(1);

    const errors = await syncQueueRepository.listByStatus(db, USER_A, 'ERROR');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.lastError).toBe('No tienes permiso para registrar controles');
    expect(errors[0]?.nextAttemptAt).toBeNull();
  });

  it('divide más de 100 elementos en múltiples lotes de hasta 100', async () => {
    const total = 205;
    for (let i = 1; i <= total; i += 1) {
      await seedPendingCheckup(db, USER_A, makeCheckupItem(makeUuid(i)));
    }

    const batchSizes: number[] = [];
    const post = vi.fn<PostSyncCheckupsFn>(async (items) => {
      batchSizes.push(items.length);
      return {
        results: items.map((item) => ({
          id: item.id,
          status: 'CREATED' as const,
          checkup: makeServerCheckup(item),
        })),
      };
    });

    const summary = await flushCheckupQueue({ db, userId: USER_A, now: NOW_ISO, post });

    expect(batchSizes).toEqual([100, 100, 5]);
    expect(summary).toEqual({
      attempted: 205,
      synced: 205,
      failedPermanent: 0,
      deferredRetry: 0,
      batches: 3,
    });

    expect(await syncQueueRepository.countPending(db, USER_A)).toBe(0);
    expect(await syncQueueRepository.listByStatus(db, USER_A, 'SENT')).toHaveLength(205);
  });

  it('recupera elementos que quedaron en SENDING al iniciar SyncEngine', async () => {
    const id = makeUuid(20);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id));
    await syncQueueRepository.updateStatus(db, USER_A, id, 'SENDING');

    const post = vi.fn<PostSyncCheckupsFn>(async (items) => ({
      results: items.map((item) => ({
        id: item.id,
        status: 'DUPLICATE' as const,
        checkup: makeServerCheckup(item),
      })),
    }));

    // Primero inicia offline: debe recuperar SENDING -> LOCAL sin enviar todavía.
    let currentConnectivity: ConnectivityStatus = 'offline';
    const engine = createSyncEngine({
      getDb: async () => db,
      post,
      getConnectivity: async () => currentConnectivity,
      subscribeToConnectivity: () => () => {},
      subscribeToAppState: () => () => {},
      now: () => Date.parse(NOW_ISO),
    });

    await engine.start(USER_A);

    expect(post).not.toHaveBeenCalled();
    expect(engine.getSyncState()).toEqual({
      pending: 1,
      sending: 0,
      error: 0,
      lastSyncedAt: null,
    });
    expect(await syncQueueRepository.listByStatus(db, USER_A, 'LOCAL')).toHaveLength(1);
    expect(await syncQueueRepository.listByStatus(db, USER_A, 'SENDING')).toHaveLength(0);

    // Ahora pasa a online y llama syncNow: reenvía de forma idempotente (DUPLICATE) sin duplicar.
    currentConnectivity = 'online';
    await engine.syncNow();

    expect(post).toHaveBeenCalledTimes(1);
    expect(engine.getSyncState()).toEqual({
      pending: 0,
      sending: 0,
      error: 0,
      lastSyncedAt: NOW_ISO,
    });
    expect(await checkupsRepository.listByChild(db, USER_A, CHILD_ID)).toHaveLength(1);

    engine.stop();
  });

  it('garantiza single-flight ante disparos concurrentes sin duplicar envíos', async () => {
    const id = makeUuid(30);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id));

    let resolvePost!: (res: SyncCheckupsResponse) => void;
    const post = vi.fn<PostSyncCheckupsFn>(
      () =>
        new Promise<SyncCheckupsResponse>((resolve) => {
          resolvePost = resolve;
        }),
    );

    const first = flushCheckupQueue({ db, userId: USER_A, now: NOW_ISO, post });
    const second = flushCheckupQueue({ db, userId: USER_A, now: NOW_ISO, post });

    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1);
    });

    const item = makeCheckupItem(id);
    resolvePost({
      results: [{ id, status: 'CREATED', checkup: makeServerCheckup(item) }],
    });

    const [res1, res2] = await Promise.all([first, second]);
    expect(res1.synced).toBe(1);
    expect(res2.synced).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('syncNow ignora el tiempo de espera (next_attempt_at)', async () => {
    const id = makeUuid(40);
    const futureRetry = '2026-11-14T15:05:00.000Z';
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id), futureRetry);

    const post = vi.fn<PostSyncCheckupsFn>(async (items) => ({
      results: items.map((item) => ({
        id: item.id,
        status: 'CREATED' as const,
        checkup: makeServerCheckup(item),
      })),
    }));

    const engine = createSyncEngine({
      getDb: async () => db,
      post,
      getConnectivity: async () => 'online',
      subscribeToConnectivity: () => () => {},
      subscribeToAppState: () => () => {},
      now: () => Date.parse(NOW_ISO),
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    });

    // Al arrancar con next_attempt_at futuro no envía automáticamente.
    await engine.start(USER_A);
    expect(post).not.toHaveBeenCalled();

    // El botón manual syncNow ignora next_attempt_at y envía de inmediato.
    await engine.syncNow();
    expect(post).toHaveBeenCalledTimes(1);
    expect(engine.getSyncState().pending).toBe(0);

    engine.stop();
  });

  it('no envía si está offline y sincroniza al pasar a online o AppState active', async () => {
    const id1 = makeUuid(50);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id1), '2026-11-14T15:04:00.000Z');

    let connectivityListener: ((status: ConnectivityStatus) => void) | null = null;
    let appStateListener: ((state: AppStateStatus) => void) | null = null;

    const post = vi.fn<PostSyncCheckupsFn>(async (items) => ({
      results: items.map((item) => ({
        id: item.id,
        status: 'CREATED' as const,
        checkup: makeServerCheckup(item),
      })),
    }));

    const engine = createSyncEngine({
      getDb: async () => db,
      post,
      getConnectivity: async () => 'offline',
      subscribeToConnectivity: (listener) => {
        connectivityListener = listener;
        return () => {
          connectivityListener = null;
        };
      },
      subscribeToAppState: (listener) => {
        appStateListener = listener;
        return () => {
          appStateListener = null;
        };
      },
      now: () => Date.parse(NOW_ISO),
    });

    await engine.start(USER_A);
    expect(post).not.toHaveBeenCalled();

    // AppState active mientras está offline tampoco envía.
    appStateListener!('active');
    await Promise.resolve();
    expect(post).not.toHaveBeenCalled();

    // Al pasar a online, reinicia la espera y envía de inmediato.
    connectivityListener!('online');
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1);
    });

    // Encola otro control y dispara regreso al primer plano estando online.
    const id2 = makeUuid(51);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id2));

    appStateListener!('active');
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledTimes(2);
    });

    engine.stop();
  });

  it('programa temporizador al next_attempt_at online y lo cancela al ir offline', async () => {
    const id = makeUuid(60);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id));

    let connectivityListener: ((status: ConnectivityStatus) => void) | null = null;
    let currentNowMs = Date.parse(NOW_ISO);
    const scheduledTimers: Array<{ delayMs: number; callback: () => void; cleared: boolean }> = [];

    let attempt = 0;
    const post = vi.fn<PostSyncCheckupsFn>(async (items) => {
      attempt += 1;
      if (attempt === 1) {
        throw new TypeError('Network request failed');
      }
      return {
        results: items.map((item) => ({
          id: item.id,
          status: 'CREATED' as const,
          checkup: makeServerCheckup(item),
        })),
      };
    });

    const engine = createSyncEngine({
      getDb: async () => db,
      post,
      getConnectivity: async () => 'online',
      subscribeToConnectivity: (listener) => {
        connectivityListener = listener;
        return () => {};
      },
      subscribeToAppState: () => () => {},
      now: () => currentNowMs,
      random: () => 0.5,
      setTimer: (callback, delayMs) => {
        const entry = { delayMs, callback, cleared: false };
        scheduledTimers.push(entry);
        return entry as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: (timer) => {
        const entry = timer as unknown as { cleared: boolean };
        entry.cleared = true;
      },
    });

    await engine.start(USER_A);

    expect(post).toHaveBeenCalledTimes(1);
    expect(scheduledTimers).toHaveLength(1);
    expect(scheduledTimers[0]?.delayMs).toBe(1_000);
    expect(scheduledTimers[0]?.cleared).toBe(false);

    // Al avanzar el reloj y dispararse el temporizador, completa el envío.
    currentNowMs += 1_000;
    scheduledTimers[0]!.callback();

    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledTimes(2);
    });
    expect(engine.getSyncState().pending).toBe(0);

    // Si falla otro ítem y luego pasa a offline, se cancela el temporizador pendiente.
    const id2 = makeUuid(61);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id2));
    attempt = 0; // próximo fallo
    await engine.syncNow();
    const lastTimer = scheduledTimers[scheduledTimers.length - 1];
    expect(lastTimer?.cleared).toBe(false);

    connectivityListener!('offline');
    expect(lastTimer?.cleared).toBe(true);

    engine.stop();
  });

  it('aísla completamente cola, controles, conteos y recuperación por usuario', async () => {
    const idUserA = makeUuid(70);
    const idUserB = makeUuid(71);

    await seedPendingCheckup(db, USER_A, makeCheckupItem(idUserA));
    await seedPendingCheckup(db, USER_B, makeCheckupItem(idUserB));
    await syncQueueRepository.updateStatus(db, USER_B, idUserB, 'SENDING');

    const sentIds: string[] = [];
    const post = vi.fn<PostSyncCheckupsFn>(async (items) => {
      sentIds.push(...items.map((item) => item.id));
      return {
        results: items.map((item) => ({
          id: item.id,
          status: 'CREATED' as const,
          checkup: makeServerCheckup(item, USER_A),
        })),
      };
    });

    const engine = createSyncEngine({
      getDb: async () => db,
      post,
      getConnectivity: async () => 'online',
      subscribeToConnectivity: () => () => {},
      subscribeToAppState: () => () => {},
      now: () => Date.parse(NOW_ISO),
    });

    await engine.start(USER_A);

    expect(sentIds).toEqual([idUserA]);
    expect(engine.getSyncState()).toEqual({
      pending: 0,
      sending: 0,
      error: 0,
      lastSyncedAt: NOW_ISO,
    });

    // El registro de USER_B permanece intacto en SENDING y en checkups LOCAL.
    const userBQueue = await syncQueueRepository.listByStatus(db, USER_B, 'SENDING');
    expect(userBQueue.map((r) => r.id)).toEqual([idUserB]);
    const userBEntries = await checkupsRepository.listEntriesByChild(db, USER_B, CHILD_ID);
    expect(userBEntries[0]?.syncState).toBe('LOCAL');

    engine.stop();
  });

  it('emite estado observable { pending, sending, error, lastSyncedAt }', async () => {
    const id1 = makeUuid(80);
    const id2 = makeUuid(81);
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id1));
    await seedPendingCheckup(db, USER_A, makeCheckupItem(id2));

    let resolvePost!: (res: SyncCheckupsResponse) => void;
    const post = vi.fn<PostSyncCheckupsFn>(
      () =>
        new Promise<SyncCheckupsResponse>((resolve) => {
          resolvePost = resolve;
        }),
    );

    const engine = createSyncEngine({
      getDb: async () => db,
      post,
      getConnectivity: async () => 'online',
      subscribeToConnectivity: () => () => {},
      subscribeToAppState: () => () => {},
      now: () => Date.parse(NOW_ISO),
    });

    const observedStates: SyncState[] = [];
    const unsubscribe = engine.subscribe((state) => {
      observedStates.push(state);
    });

    const startPromise = engine.start(USER_A);

    await vi.waitFor(() => {
      expect(observedStates.some((s) => s.sending === 2)).toBe(true);
    });

    resolvePost({
      results: [
        { id: id1, status: 'CREATED', checkup: makeServerCheckup(makeCheckupItem(id1)) },
        { id: id2, status: 'ERROR', error: { status: 400, message: 'Peso fuera de rango' } },
      ],
    });

    await startPromise;

    expect(observedStates[0]).toEqual({
      pending: 2,
      sending: 0,
      error: 0,
      lastSyncedAt: null,
    });
    expect(observedStates[observedStates.length - 1]).toEqual({
      pending: 0,
      sending: 0,
      error: 1,
      lastSyncedAt: NOW_ISO,
    });

    engine.stop();
    expect(engine.getSyncState()).toEqual({
      pending: 0,
      sending: 0,
      error: 0,
      lastSyncedAt: null,
    });

    unsubscribe();
  });

  it('degrada sin errores si getLocalDatabase() falla y sin registrar PII', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const post = vi.fn<PostSyncCheckupsFn>();

    const engine = createSyncEngine({
      getDb: async () => {
        throw new Error('SQLCipher unavailable: Maria Perez peso 12.5');
      },
      post,
      getConnectivity: async () => 'online',
      subscribeToConnectivity: () => () => {},
      subscribeToAppState: () => () => {},
    });

    await expect(engine.start(USER_A)).resolves.toBeUndefined();
    await expect(engine.syncNow()).resolves.toBeUndefined();
    await expect(engine.refreshState()).resolves.toEqual({
      pending: 0,
      sending: 0,
      error: 0,
      lastSyncedAt: null,
    });
    expect(() => engine.stop()).not.toThrow();
    expect(post).not.toHaveBeenCalled();

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('Maria Perez');
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain(USER_A);
  });

  it('no modifica elementos de otros tipos (follow-up / feeding) en sync_queue', async () => {
    const checkupId = makeUuid(90);
    const followUpId = makeUuid(91);

    await seedPendingCheckup(db, USER_A, makeCheckupItem(checkupId));
    await syncQueueRepository.enqueue(db, USER_A, {
      id: followUpId,
      kind: 'follow-up',
      payload: {
        id: followUpId,
        childId: CHILD_ID,
        type: 'observation',
        details: 'Control de seguimiento',
      },
    });

    const post = vi.fn<PostSyncCheckupsFn>(async (items) => ({
      results: items.map((item) => ({
        id: item.id,
        status: 'CREATED' as const,
        checkup: makeServerCheckup(item),
      })),
    }));

    const summary = await flushCheckupQueue({ db, userId: USER_A, now: NOW_ISO, post });
    expect(summary.synced).toBe(1);
    expect(post).toHaveBeenCalledWith([expect.objectContaining({ id: checkupId })]);

    const remainingLocal = await syncQueueRepository.listByStatus(db, USER_A, 'LOCAL');
    expect(remainingLocal).toHaveLength(1);
    expect(remainingLocal[0]?.id).toBe(followUpId);
  });
});
