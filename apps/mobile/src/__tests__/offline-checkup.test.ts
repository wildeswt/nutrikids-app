import type {
  CaregiverCheckupResponse,
  ChildResponse,
  CreateCheckupInput,
} from '@nutrikids/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCheckupSavedParams } from '../lib/checkup-route.js';
import { CheckupApiError } from '../lib/checkups-api.js';
import {
  checkupsRepository,
  childrenRepository,
  runMigrations,
  syncQueueRepository,
} from '../lib/local-db/index.js';
import {
  buildSyncCheckupItem,
  createCheckupWithOfflineFallback,
  discardOfflineCheckupInDb,
  listPendingSyncCheckupItemsInDb,
  OfflineCheckupSaveError,
  retryOfflineCheckup,
  retryOfflineCheckupInDb,
  saveCheckupLocallyInDb,
} from '../lib/offline-checkup.js';
import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db.js';

const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const CHILD_A = '11111111-1111-4111-8111-111111111111';
const CHILD_B = '22222222-2222-4222-8222-222222222222';
const CHECKUP_1 = 'c1111111-1111-4111-8111-111111111111';
const CHECKUP_2 = 'c2222222-2222-4222-8222-222222222222';
const CHECKUP_3 = 'c3333333-3333-4333-8333-333333333333';
const CHECKUP_OLD = 'c4444444-4444-4444-8444-444444444444';
const CHECKUP_B1 = 'c5555555-5555-4555-8555-555555555555';

function makeChild(overrides: Partial<ChildResponse> = {}): ChildResponse {
  return {
    id: CHILD_A,
    firstName: 'Mateo',
    lastName: 'Gómez',
    birthDate: '2023-06-15',
    sex: 'MALE',
    ...overrides,
  };
}

function makeInput(overrides: Partial<CreateCheckupInput> = {}): CreateCheckupInput {
  return {
    id: CHECKUP_1,
    measuredAt: '2026-10-18T12:00:00.000Z',
    weightKg: 12.2,
    lengthHeightCm: 97.0,
    position: 'STANDING',
    notes: 'Control en casa',
    ...overrides,
  };
}

function makeServerCheckup(
  overrides: Partial<CaregiverCheckupResponse> = {},
): CaregiverCheckupResponse {
  return {
    id: CHECKUP_1,
    childId: CHILD_A,
    measuredAt: '2026-10-18T12:00:00.000Z',
    weightKg: 12.2,
    lengthHeightCm: 97.0,
    position: 'STANDING',
    origin: 'CAREGIVER',
    recordedById: USER_A,
    recordedBy: null,
    correctedCheckupId: null,
    isCurrent: true,
    notes: 'Control en casa',
    createdAt: '2026-10-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('offline-checkup (NK-61 parte B)', () => {
  let db: SqliteTestDb;

  beforeEach(async () => {
    db = createSqliteTestDb();
    await runMigrations(db);
    await childrenRepository.upsertMany(db, USER_A, [
      makeChild({ id: CHILD_A, firstName: 'Mateo' }),
      makeChild({ id: CHILD_B, firstName: 'Sofía' }),
    ]);
  });

  afterEach(() => {
    db.close();
  });

  it('guarda control LOCAL y encola atómicamente sin conexión, sin campo results', async () => {
    const createRemote = vi.fn();
    const syncNow = vi.fn(async () => {});
    const refreshSyncState = vi.fn(async () => {});

    const result = await createCheckupWithOfflineFallback({
      userId: USER_A,
      childId: CHILD_A,
      input: makeInput(),
      isOnline: false,
      deps: { createRemote, getDb: async () => db, syncNow, refreshSyncState },
    });

    expect(createRemote).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
    expect(refreshSyncState).toHaveBeenCalledTimes(1);
    expect(result.savedLocally).toBe(true);
    expect(result.localOnly).toBe(true);
    expect(result.id).toBe(CHECKUP_1);

    const checkupRow = await db.getFirstAsync<{ sync_state: string; payload: string }>(
      'SELECT sync_state, payload FROM checkups WHERE user_id = ? AND id = ?;',
      [USER_A, CHECKUP_1],
    );
    expect(checkupRow?.sync_state).toBe('LOCAL');
    expect('results' in (JSON.parse(checkupRow!.payload) as Record<string, unknown>)).toBe(false);

    const queued = await syncQueueRepository.getById(db, USER_A, CHECKUP_1);
    expect(queued).not.toBeNull();
    expect(queued?.kind).toBe('checkup');
    expect(queued?.status).toBe('LOCAL');
    if (queued?.kind === 'checkup') {
      expect(queued.payload.childId).toBe(CHILD_A);
      expect(queued.payload.id).toBe(CHECKUP_1);
      expect('results' in queued.payload).toBe(false);
    }

    const params = toCheckupSavedParams(makeChild(), result);
    expect(params.pendingSync).toBe('1');
  });

  it('cae a guardado local con el mismo id si falla por red estando en línea', async () => {
    const createRemote = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const syncNow = vi.fn(async () => {});

    const result = await createCheckupWithOfflineFallback({
      userId: USER_A,
      childId: CHILD_A,
      input: makeInput({ id: undefined }),
      isOnline: true,
      deps: {
        createRemote,
        getDb: async () => db,
        syncNow,
        refreshSyncState: async () => {},
        generateId: () => CHECKUP_2,
      },
    });

    expect(createRemote).toHaveBeenCalledWith(CHILD_A, expect.objectContaining({ id: CHECKUP_2 }));
    expect(result.savedLocally).toBe(true);
    expect(result.id).toBe(CHECKUP_2);
    expect(syncNow).toHaveBeenCalledTimes(1);

    const queued = await syncQueueRepository.getById(db, USER_A, CHECKUP_2);
    expect(queued?.status).toBe('LOCAL');
  });

  it('NO cae a guardado local ante errores HTTP 4xx', async () => {
    const createRemote = vi.fn(async () => {
      throw new CheckupApiError('Falta consentimiento informado vigente', 403);
    });

    await expect(
      createCheckupWithOfflineFallback({
        userId: USER_A,
        childId: CHILD_A,
        input: makeInput(),
        isOnline: true,
        deps: { createRemote, getDb: async () => db },
      }),
    ).rejects.toMatchObject({ status: 403 });

    const queued = await syncQueueRepository.getById(db, USER_A, CHECKUP_1);
    expect(queued).toBeNull();
    const entries = await checkupsRepository.listEntriesByChild(db, USER_A, CHILD_A);
    expect(entries).toHaveLength(0);
  });

  it('en línea no marca savedLocally y cachea el control como SENT', async () => {
    const serverCheckup = makeServerCheckup();
    const createRemote = vi.fn(async () => serverCheckup);

    const result = await createCheckupWithOfflineFallback({
      userId: USER_A,
      childId: CHILD_A,
      input: makeInput(),
      isOnline: true,
      deps: { createRemote, getDb: async () => db },
    });

    expect(result.savedLocally).toBeUndefined();
    expect(result.localOnly).toBeUndefined();
    const queued = await syncQueueRepository.getById(db, USER_A, CHECKUP_1);
    expect(queued).toBeNull();

    const entries = await checkupsRepository.listEntriesByChild(db, USER_A, CHILD_A);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.syncState).toBe('SENT');
  });

  it('exige confirmOutlier en valores atípicos igual que en línea', async () => {
    const outlierWithoutConfirm = makeInput({ weightKg: 35 });

    await expect(
      createCheckupWithOfflineFallback({
        userId: USER_A,
        childId: CHILD_A,
        input: outlierWithoutConfirm,
        isOnline: false,
        deps: { getDb: async () => db },
      }),
    ).rejects.toThrow(/at[ií]pic/i);

    const outlierConfirmed = makeInput({ weightKg: 35, confirmOutlier: true });
    const item = buildSyncCheckupItem(CHILD_A, outlierConfirmed);
    expect(item.confirmOutlier).toBe(true);
    expect('results' in item).toBe(false);

    const saved = await createCheckupWithOfflineFallback({
      userId: USER_A,
      childId: CHILD_A,
      input: outlierConfirmed,
      isOnline: false,
      deps: { getDb: async () => db, refreshSyncState: async () => {} },
    });
    expect(saved.savedLocally).toBe(true);
  });

  it('lanza error claro cuando no hay base local disponible y está sin conexión', async () => {
    await expect(
      createCheckupWithOfflineFallback({
        userId: USER_A,
        childId: CHILD_A,
        input: makeInput(),
        isOnline: false,
        deps: { getDb: async () => null },
      }),
    ).rejects.toEqual(
      new OfflineCheckupSaveError('Necesitas conexión para guardar el control en este dispositivo'),
    );
  });

  it('reintentar reinicia ERROR a LOCAL con attempts=0 y llama syncNow()', async () => {
    await saveCheckupLocallyInDb(db, USER_A, buildSyncCheckupItem(CHILD_A, makeInput()));
    await syncQueueRepository.updateStatus(db, USER_A, CHECKUP_1, 'ERROR', {
      attempts: 3,
      nextAttemptAt: '2026-10-19T12:00:00.000Z',
      lastError: 'Falta consentimiento informado',
    });

    const syncNow = vi.fn(async () => {});
    await retryOfflineCheckup(USER_A, CHECKUP_1, { getDb: async () => db, syncNow });

    const updated = await syncQueueRepository.getById(db, USER_A, CHECKUP_1);
    expect(updated?.status).toBe('LOCAL');
    expect(updated?.attempts).toBe(0);
    expect(updated?.nextAttemptAt).toBeNull();
    expect(updated?.lastError).toBeNull();
    expect(syncNow).toHaveBeenCalledTimes(1);

    // Verifica también helper directo sobre DB
    await syncQueueRepository.updateStatus(db, USER_A, CHECKUP_1, 'ERROR', {
      attempts: 1,
      nextAttemptAt: '2026-10-19T13:00:00.000Z',
      lastError: 'Error temporal',
    });
    await retryOfflineCheckupInDb(db, USER_A, CHECKUP_1);
    const updatedAgain = await syncQueueRepository.getById(db, USER_A, CHECKUP_1);
    expect(updatedAgain?.status).toBe('LOCAL');
    expect(updatedAgain?.attempts).toBe(0);
    expect(updatedAgain?.nextAttemptAt).toBeNull();
    expect(updatedAgain?.lastError).toBeNull();
  });

  it('descartar borra cola y control LOCAL sin tocar controles SENT', async () => {
    await saveCheckupLocallyInDb(
      db,
      USER_A,
      buildSyncCheckupItem(CHILD_A, makeInput({ id: CHECKUP_1 })),
    );
    await checkupsRepository.upsertMany(db, USER_A, [makeServerCheckup({ id: CHECKUP_2 })]);

    await discardOfflineCheckupInDb(db, USER_A, CHECKUP_1);

    expect(await syncQueueRepository.getById(db, USER_A, CHECKUP_1)).toBeNull();
    const entries = await checkupsRepository.listEntriesByChild(db, USER_A, CHILD_A);
    expect(entries.map((entry) => entry.checkup.id)).toEqual([CHECKUP_2]);
  });

  it('lista estados LOCAL, ERROR y SENT (24 h) con aislamiento por usuario', async () => {
    const nowMs = Date.parse('2026-10-20T12:00:00.000Z');

    await saveCheckupLocallyInDb(
      db,
      USER_A,
      buildSyncCheckupItem(CHILD_A, makeInput({ id: CHECKUP_1 })),
    );
    await saveCheckupLocallyInDb(
      db,
      USER_A,
      buildSyncCheckupItem(CHILD_B, makeInput({ id: CHECKUP_2 })),
    );
    await syncQueueRepository.updateStatus(db, USER_A, CHECKUP_2, 'ERROR', {
      attempts: 2,
      nextAttemptAt: null,
      lastError: 'Sin consentimiento vigente',
    });

    await saveCheckupLocallyInDb(
      db,
      USER_A,
      buildSyncCheckupItem(CHILD_A, makeInput({ id: CHECKUP_3 })),
    );
    await syncQueueRepository.updateStatus(db, USER_A, CHECKUP_3, 'SENT', {
      attempts: 1,
      nextAttemptAt: null,
      lastError: null,
    });
    await db.runAsync('UPDATE sync_queue SET updated_at = ? WHERE user_id = ? AND id = ?;', [
      '2026-10-20T06:00:00.000Z',
      USER_A,
      CHECKUP_3,
    ]);

    // SENT antiguo (>24h) no debe mostrarse
    await saveCheckupLocallyInDb(
      db,
      USER_A,
      buildSyncCheckupItem(CHILD_A, makeInput({ id: CHECKUP_OLD })),
    );
    await syncQueueRepository.updateStatus(db, USER_A, CHECKUP_OLD, 'SENT', {
      attempts: 1,
      nextAttemptAt: null,
      lastError: null,
    });
    await db.runAsync('UPDATE sync_queue SET updated_at = ? WHERE user_id = ? AND id = ?;', [
      '2026-10-18T00:00:00.000Z',
      USER_A,
      CHECKUP_OLD,
    ]);

    // Usuario B tiene su propio control pendiente: no debe aparecer para USER_A
    const otherChild = makeChild({ id: CHILD_A, firstName: 'Otro' });
    await childrenRepository.upsertMany(db, USER_B, [otherChild]);
    await saveCheckupLocallyInDb(
      db,
      USER_B,
      buildSyncCheckupItem(CHILD_A, makeInput({ id: CHECKUP_B1 })),
    );

    const userAItems = await listPendingSyncCheckupItemsInDb(db, USER_A, nowMs);
    expect(userAItems).toHaveLength(3);
    expect(userAItems.map((item) => item.status)).toEqual(
      expect.arrayContaining(['LOCAL', 'ERROR', 'SENT']),
    );
    expect(userAItems.find((item) => item.id === CHECKUP_1)?.childName).toBe('Mateo');
    expect(userAItems.find((item) => item.id === CHECKUP_2)?.childName).toBe('Sofía');
    expect(userAItems.find((item) => item.id === CHECKUP_2)?.lastError).toBe(
      'Sin consentimiento vigente',
    );
    expect(userAItems.find((item) => item.id === CHECKUP_OLD)).toBeUndefined();

    const userBItems = await listPendingSyncCheckupItemsInDb(db, USER_B, nowMs);
    expect(userBItems).toHaveLength(1);
    expect(userBItems[0]?.childName).toBe('Otro');
  });
});
