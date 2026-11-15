import type { CheckupResponse, CreateFollowUpBatchInput, SyncCheckupItem } from '@nutrikids/shared';
import type { AppStateStatus } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectivityStatus } from '../lib/connectivity.js';
import type * as FollowUpsApiTypes from '../lib/follow-ups-api.js';
import type { LocalDb } from '../lib/local-db/types.js';
import type * as OfflineReadTypes from '../lib/offline-read.js';

const testEnv = vi.hoisted(() => ({
  activeDb: null as LocalDb | null,
  secureValues: new Map<string, string>(),
  createFollowUpBatch: vi.fn(),
  fetchAlertDetail: vi.fn(),
  updateAlertStatus: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => testEnv.secureValues.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    testEnv.secureValues.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    testEnv.secureValues.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('../lib/offline-read.js', async (importOriginal) => {
  const actual = await importOriginal<typeof OfflineReadTypes>();
  return {
    ...actual,
    tryGetLocalDatabase: vi.fn(async () => testEnv.activeDb),
  };
});

vi.mock('../lib/follow-ups-api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof FollowUpsApiTypes>();
  return {
    ...actual,
    createFollowUpBatch: testEnv.createFollowUpBatch,
  };
});

vi.mock('../lib/alerts-api.js', () => ({
  fetchAlertDetail: testEnv.fetchAlertDetail,
  updateAlertStatus: testEnv.updateAlertStatus,
}));

import { migrateLegacyFollowUpStorage } from '../lib/follow-up-migration.js';
import {
  FOLLOW_UP_STORAGE_KEY,
  clearDraft,
  clearDrafts,
  clearRejectedFollowUp,
  draftKey,
  getDraft,
  getLatestRejectedFollowUp,
  listPending,
  saveDraft,
} from '../lib/follow-up-storage.js';
import { flushPendingFollowUps, submitFollowUp } from '../lib/follow-up-sync.js';
import { FollowUpApiError, FollowUpOfflineError } from '../lib/follow-ups-api.js';
import {
  checkupsRepository,
  metaRepository,
  runMigrations,
  syncQueueRepository,
} from '../lib/local-db/index.js';
import { computeBackoffMs } from '../lib/sync/backoff.js';
import { SyncApiError } from '../lib/sync/sync-api.js';
import {
  createSyncEngine,
  flushFollowUpQueue,
  type PostSyncCheckupsFn,
  type SyncState,
} from '../lib/sync/sync-engine.js';
import { makeDetail } from './alerts-fixtures.js';
import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '99999999-9999-4999-8999-999999999999';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const ALERT_ID = '33333333-3333-4333-8333-333333333333';
const NOW_ISO = '2026-11-14T15:00:00.000Z';

function makeUuid(index: number): string {
  const hex = index.toString(16).padStart(12, '0');
  return `bbbbbbbb-bbbb-4bbb-8bbb-${hex}`;
}

function makeBatchInput(
  index: number,
  overrides: Partial<CreateFollowUpBatchInput> = {},
): CreateFollowUpBatchInput {
  return {
    groupId: makeUuid(index * 10 + 1),
    alertId: ALERT_ID,
    items: [
      {
        id: makeUuid(index * 10 + 2),
        type: 'observation',
        details: `Observación clínica #${index}`,
      },
    ],
    ...overrides,
  };
}

function makeCheckupItem(id: string): SyncCheckupItem {
  return {
    id,
    childId: CHILD_ID,
    measuredAt: '2026-11-14T14:00:00.000Z',
    weightKg: 12.8,
    lengthHeightCm: 89.5,
    position: 'STANDING',
    notes: 'Control mixto',
  };
}

function makeServerCheckup(item: SyncCheckupItem, userId = USER_A): CheckupResponse {
  return {
    id: item.id,
    childId: item.childId,
    measuredAt: item.measuredAt,
    weightKg: item.weightKg,
    lengthHeightCm: item.lengthHeightCm,
    position: item.position,
    origin: 'PROFESSIONAL',
    recordedById: userId,
    recordedBy: {
      userId,
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
        zScore: 0.1,
        percentile: 54,
        classification: 'NORMAL',
        referenceVersion: 'WHO-2006',
      },
    ],
  };
}

describe('seguimientos clínicos en la cola general (NK-62 parte A)', () => {
  let db: SqliteTestDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    testEnv.secureValues.clear();
    db = createSqliteTestDb();
    await runMigrations(db);
    testEnv.activeDb = db;
    testEnv.createFollowUpBatch.mockResolvedValue([]);
    testEnv.fetchAlertDetail.mockResolvedValue(
      makeDetail({ id: ALERT_ID, status: 'PENDING_REVIEW' }),
    );
    testEnv.updateAlertStatus.mockImplementation(async (_id: string, status: string) =>
      makeDetail({ id: ALERT_ID, status: status as 'REVIEWED' | 'FOLLOW_UP_ESTABLISHED' }),
    );
  });

  afterEach(() => {
    testEnv.activeDb = null;
    db.close();
  });

  describe('procesamiento en sync_queue', () => {
    it('encola en sync_queue sin conexión y envía con éxito junto a establishAlert', async () => {
      const batch = makeBatchInput(1);
      const submitResult = await submitFollowUp(
        {
          userId: USER_A,
          childId: CHILD_ID,
          alertId: ALERT_ID,
          establish: true,
          input: batch,
        },
        { isOnline: false },
      );

      expect(submitResult).toEqual({ kind: 'queued' });
      const pendingBefore = await listPending(USER_A);
      expect(pendingBefore).toHaveLength(1);
      expect(pendingBefore[0]?.input).toEqual(batch);

      const summary = await flushFollowUpQueue({ db, userId: USER_A, now: NOW_ISO });

      expect(summary).toMatchObject({
        attempted: 1,
        synced: 1,
        failedPermanent: 0,
        deferredRetry: 0,
      });
      expect(testEnv.createFollowUpBatch).toHaveBeenCalledWith(CHILD_ID, batch);
      expect(testEnv.updateAlertStatus).toHaveBeenNthCalledWith(1, ALERT_ID, 'REVIEWED');
      expect(testEnv.updateAlertStatus).toHaveBeenNthCalledWith(
        2,
        ALERT_ID,
        'FOLLOW_UP_ESTABLISHED',
      );

      const record = await syncQueueRepository.getById(db, USER_A, batch.items[0]!.id);
      expect(record?.status).toBe('SENT');
      expect(await listPending(USER_A)).toHaveLength(0);
    });

    it('marca ERROR con mensaje del servidor ante 4xx definitivo y no reintenta automáticamente', async () => {
      const batch = makeBatchInput(2);
      testEnv.createFollowUpBatch.mockRejectedValue(
        new FollowUpApiError('Sin consentimiento activo del cuidador', 422),
      );

      await submitFollowUp(
        {
          userId: USER_A,
          childId: CHILD_ID,
          alertId: ALERT_ID,
          establish: true,
          input: batch,
        },
        { isOnline: false },
      );

      const firstRun = await flushFollowUpQueue({ db, userId: USER_A, now: NOW_ISO });
      expect(firstRun).toMatchObject({ attempted: 1, synced: 0, failedPermanent: 1 });

      const itemId = batch.items[0]!.id;
      const errored = await syncQueueRepository.getById(db, USER_A, itemId);
      expect(errored?.status).toBe('ERROR');
      expect(errored?.nextAttemptAt).toBeNull();
      expect(errored?.lastError).toBe('Sin consentimiento activo del cuidador');
      expect(await listPending(USER_A)).toHaveLength(0);

      // Un segundo ciclo (incluso ignorando programación) no vuelve a enviarlo.
      const secondRun = await flushFollowUpQueue({
        db,
        userId: USER_A,
        now: NOW_ISO,
        ignoreSchedule: true,
      });
      expect(secondRun.attempted).toBe(0);
      expect(testEnv.createFollowUpBatch).toHaveBeenCalledTimes(1);

      // El formulario puede restaurar el rechazado para corregirlo y limpiarlo al guardar.
      const rejected = await getLatestRejectedFollowUp(USER_A, {
        alertId: ALERT_ID,
        childId: CHILD_ID,
      });
      expect(rejected?.lastError).toBe('Sin consentimiento activo del cuidador');
      expect(rejected?.form.observations).toBe('Observación clínica #2');

      await clearRejectedFollowUp(USER_A, { alertId: ALERT_ID, childId: CHILD_ID });
      expect(await syncQueueRepository.getById(db, USER_A, itemId)).toBeNull();
    });

    it('aplica espera creciente ante red/5xx/408/429 y reintenta lote idempotente si falló la alerta', async () => {
      const batch = makeBatchInput(3);
      await submitFollowUp(
        {
          userId: USER_A,
          childId: CHILD_ID,
          alertId: ALERT_ID,
          establish: true,
          input: batch,
        },
        { isOnline: false },
      );

      // Primer fallo transitorio 503 al enviar el lote.
      testEnv.createFollowUpBatch.mockRejectedValueOnce(
        new FollowUpApiError('Servicio caído', 503),
      );
      const run1 = await flushFollowUpQueue({ db, userId: USER_A, now: NOW_ISO, random: () => 0 });
      expect(run1).toMatchObject({ attempted: 1, synced: 0, deferredRetry: 1 });

      const itemId = batch.items[0]!.id;
      const after503 = await syncQueueRepository.getById(db, USER_A, itemId);
      expect(after503?.status).toBe('LOCAL');
      expect(after503?.attempts).toBe(1);
      const expectedBackoff1 = new Date(
        Date.parse(NOW_ISO) + computeBackoffMs(0, () => 0),
      ).toISOString();
      expect(after503?.nextAttemptAt).toBe(expectedBackoff1);

      // Al vencer el tiempo: el lote responde 200 pero falla la red al mover la alerta.
      testEnv.createFollowUpBatch.mockResolvedValueOnce([]);
      testEnv.fetchAlertDetail.mockRejectedValueOnce(new TypeError('Network request failed'));

      const t2 = expectedBackoff1;
      const run2 = await flushFollowUpQueue({ db, userId: USER_A, now: t2, random: () => 0 });
      expect(run2).toMatchObject({ attempted: 1, synced: 0, deferredRetry: 1 });

      const afterAlertNetFail = await syncQueueRepository.getById(db, USER_A, itemId);
      expect(afterAlertNetFail?.status).toBe('LOCAL');
      expect(afterAlertNetFail?.attempts).toBe(2);
      const expectedBackoff2 = new Date(
        Date.parse(t2) + computeBackoffMs(1, () => 0),
      ).toISOString();
      expect(afterAlertNetFail?.nextAttemptAt).toBe(expectedBackoff2);

      // En el tercer intento el lote se reenvía con los mismos UUIDs (200 idempotente) y cierra la alerta.
      testEnv.createFollowUpBatch.mockResolvedValueOnce([]);
      testEnv.fetchAlertDetail.mockResolvedValueOnce(
        makeDetail({ id: ALERT_ID, status: 'PENDING_REVIEW' }),
      );

      const run3 = await flushFollowUpQueue({ db, userId: USER_A, now: expectedBackoff2 });
      expect(run3).toMatchObject({ attempted: 1, synced: 1 });
      expect(testEnv.createFollowUpBatch).toHaveBeenCalledTimes(3);
      expect(testEnv.createFollowUpBatch).toHaveBeenLastCalledWith(CHILD_ID, batch);
      expect((await syncQueueRepository.getById(db, USER_A, itemId))?.status).toBe('SENT');
    });

    it('procesa controles y seguimientos mezclados en la misma cola sin interferir entre sí', async () => {
      const checkupItem = makeCheckupItem(makeUuid(50));
      await checkupsRepository.insertLocal(db, USER_A, checkupItem);
      await syncQueueRepository.enqueue(db, USER_A, {
        id: checkupItem.id,
        kind: 'checkup',
        payload: checkupItem,
      });

      const followUpBatch = makeBatchInput(4, { alertId: undefined });
      await submitFollowUp(
        {
          userId: USER_A,
          childId: CHILD_ID,
          establish: false,
          input: followUpBatch,
        },
        { isOnline: false },
      );

      // Si los controles fallan por 503, los seguimientos igualmente se envían en el mismo ciclo.
      const postMock = vi.fn<PostSyncCheckupsFn>(async () => {
        throw new SyncApiError('Temporal checkup outage', {
          kind: 'retryable-http',
          status: 503,
          retryable: true,
        });
      });

      const states: SyncState[] = [];
      let currentTime = Date.parse(NOW_ISO);
      const engine = createSyncEngine({
        getDb: async () => db,
        post: postMock,
        getConnectivity: async () => 'online',
        subscribeToConnectivity: () => () => {},
        subscribeToAppState: () => () => {},
        now: () => currentTime,
        random: () => 0,
        setTimer: (_cb, _ms) => setTimeout(() => {}, 60_000),
        clearTimer: (timer) => clearTimeout(timer),
      });
      engine.subscribe((s) => states.push(s));

      await engine.start(USER_A);

      expect(postMock).toHaveBeenCalledTimes(1);
      expect(testEnv.createFollowUpBatch).toHaveBeenCalledWith(CHILD_ID, followUpBatch);

      const checkupAfter = await syncQueueRepository.getById(db, USER_A, checkupItem.id);
      const followUpAfter = await syncQueueRepository.getById(
        db,
        USER_A,
        followUpBatch.items[0]!.id,
      );
      expect(checkupAfter?.status).toBe('LOCAL');
      expect(followUpAfter?.status).toBe('SENT');
      expect(engine.getSyncState()).toMatchObject({ pending: 1, sending: 0, error: 0 });
      expect(engine.getSyncState().lastSyncedAt).toBeTruthy();

      // Ahora los controles responden ok y el conteo baja a 0.
      currentTime += 60_000;
      postMock.mockResolvedValueOnce({
        results: [
          { id: checkupItem.id, status: 'CREATED', checkup: makeServerCheckup(checkupItem) },
        ],
      });
      await engine.syncNow();
      expect(engine.getSyncState()).toMatchObject({ pending: 0, sending: 0, error: 0 });
      engine.stop();
    });
  });

  describe('migración desde SecureStore y aislamiento por usuario', () => {
    it('migra pendientes y borradores al arrancar, respeta otro usuario y es idempotente', async () => {
      const legacyBatchA = makeBatchInput(11);
      const legacyBatchB = makeBatchInput(12);
      const legacyPayload = {
        drafts: {
          [`${USER_A}:alert:${ALERT_ID}`]: {
            userId: USER_A,
            childId: CHILD_ID,
            alertId: ALERT_ID,
            form: {
              observations: 'Borrador heredado A',
              intervention: '',
              referral: '',
              nextCheckupText: '20/11/2026',
              establish: true,
            },
            savedAt: '2026-11-14T10:00:00.000Z',
          },
          [`${USER_B}:alert:${ALERT_ID}`]: {
            userId: USER_B,
            childId: CHILD_ID,
            alertId: ALERT_ID,
            form: {
              observations: 'Borrador heredado B',
              intervention: '',
              referral: '',
              nextCheckupText: '',
              establish: false,
            },
            savedAt: '2026-11-14T10:05:00.000Z',
          },
        },
        pending: [
          {
            userId: USER_A,
            childId: CHILD_ID,
            alertId: ALERT_ID,
            establish: true,
            queuedAt: '2026-11-14T11:00:00.000Z',
            input: legacyBatchA,
          },
          {
            userId: USER_B,
            childId: CHILD_ID,
            alertId: ALERT_ID,
            establish: false,
            queuedAt: '2026-11-14T11:05:00.000Z',
            input: legacyBatchB,
          },
        ],
      };
      testEnv.secureValues.set(FOLLOW_UP_STORAGE_KEY, JSON.stringify(legacyPayload));

      const result1 = await migrateLegacyFollowUpStorage(db, USER_A);
      expect(result1).toEqual({ migratedPending: 1, migratedDrafts: 1, alreadyMigrated: false });

      // Pendiente y borrador de USER_A están en SQLite y marcados como migrados.
      const pendingA = await listPending(USER_A);
      expect(pendingA).toHaveLength(1);
      expect(pendingA[0]?.input).toEqual(legacyBatchA);
      const restoredDraftA = await getDraft(
        draftKey(USER_A, { alertId: ALERT_ID, childId: CHILD_ID }),
      );
      expect(restoredDraftA?.form.observations).toBe('Borrador heredado A');
      expect(await metaRepository.get(db, `followup-migration:v1:${USER_A}`)).not.toBeNull();

      // SecureStore solo limpió datos de USER_A; los de USER_B siguen intactos.
      const remainingRaw = testEnv.secureValues.get(FOLLOW_UP_STORAGE_KEY);
      const remainingStore = JSON.parse(remainingRaw ?? '{}');
      expect(remainingStore.pending).toHaveLength(1);
      expect(remainingStore.pending[0].userId).toBe(USER_B);
      expect(Object.keys(remainingStore.drafts)).toEqual([`${USER_B}:alert:${ALERT_ID}`]);

      // Idempotencia: segunda corrida no duplica aunque volviera a haber datos en memoria antigua.
      const result2 = await migrateLegacyFollowUpStorage(db, USER_A);
      expect(result2).toEqual({ migratedPending: 0, migratedDrafts: 0, alreadyMigrated: true });

      // Aislamiento: USER_A no ve ni procesa datos de USER_B tras migrar USER_B.
      await migrateLegacyFollowUpStorage(db, USER_B);
      expect(await listPending(USER_A)).toHaveLength(1);
      expect(await listPending(USER_B)).toHaveLength(1);
      expect(
        await getDraft(draftKey(USER_B, { alertId: ALERT_ID, childId: CHILD_ID })),
      ).not.toBeNull();

      await flushFollowUpQueue({ db, userId: USER_A, now: NOW_ISO });
      expect(await listPending(USER_A)).toHaveLength(0);
      expect(await listPending(USER_B)).toHaveLength(1);
    });

    it('conserva intacto el almacén antiguo si falla la transacción a mitad de migración', async () => {
      const legacyBatch = makeBatchInput(21);
      const rawStore = JSON.stringify({
        drafts: {
          [`${USER_A}:child:${CHILD_ID}`]: {
            userId: USER_A,
            childId: CHILD_ID,
            form: {
              observations: 'No perder esto',
              intervention: '',
              referral: '',
              nextCheckupText: '',
              establish: false,
            },
            savedAt: '2026-11-14T12:00:00.000Z',
          },
        },
        pending: [
          {
            userId: USER_A,
            childId: CHILD_ID,
            establish: false,
            queuedAt: '2026-11-14T12:00:00.000Z',
            input: legacyBatch,
          },
        ],
      });
      testEnv.secureValues.set(FOLLOW_UP_STORAGE_KEY, rawStore);

      const originalRunAsync = db.runAsync.bind(db);
      let insertCount = 0;
      vi.spyOn(db, 'runAsync').mockImplementation(async (sql, ...args) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO meta')) {
          insertCount += 1;
          if (insertCount === 1) {
            throw new Error('Disk full mid-migration');
          }
        }
        return originalRunAsync(sql, ...(args as [never]));
      });

      await expect(migrateLegacyFollowUpStorage(db, USER_A)).rejects.toThrow(
        'Disk full mid-migration',
      );

      // SQLite hizo rollback y SecureStore conserva intactos los datos antiguos.
      expect(await listPending(USER_A)).toHaveLength(0);
      expect(await getDraft(draftKey(USER_A, { childId: CHILD_ID }))).toBeNull();
      expect(await metaRepository.get(db, `followup-migration:v1:${USER_A}`)).toBeNull();
      expect(testEnv.secureValues.get(FOLLOW_UP_STORAGE_KEY)).toBe(rawStore);
    });

    it('el motor ejecuta la migración automáticamente al iniciar y actualiza los conteos', async () => {
      const legacyBatch = makeBatchInput(22);
      testEnv.secureValues.set(
        FOLLOW_UP_STORAGE_KEY,
        JSON.stringify({
          drafts: {},
          pending: [
            {
              userId: USER_A,
              childId: CHILD_ID,
              alertId: ALERT_ID,
              establish: false,
              queuedAt: '2026-11-14T12:00:00.000Z',
              input: legacyBatch,
            },
          ],
        }),
      );

      let emitConnectivity: (status: ConnectivityStatus) => void = () => {};
      const appStateListeners: Array<(state: AppStateStatus) => void> = [];
      const engine = createSyncEngine({
        getDb: async () => db,
        getConnectivity: async () => 'offline',
        subscribeToConnectivity: (cb) => {
          emitConnectivity = cb;
          return () => {
            emitConnectivity = () => {};
          };
        },
        subscribeToAppState: (cb) => {
          appStateListeners.push(cb);
          return () => {};
        },
        now: () => Date.parse(NOW_ISO),
      });

      await engine.start(USER_A);

      // Sin conexión al arrancar: migró desde SecureStore y refleja 1 pendiente en SyncState.
      expect(engine.getSyncState()).toMatchObject({ pending: 1, sending: 0, error: 0 });
      expect(testEnv.createFollowUpBatch).not.toHaveBeenCalled();

      // Al volver la conectividad, el motor envía automáticamente el seguimiento migrado.
      emitConnectivity('online');
      await vi.waitFor(() => {
        expect(engine.getSyncState().pending).toBe(0);
      });
      expect(testEnv.createFollowUpBatch).toHaveBeenCalledWith(CHILD_ID, legacyBatch);
      engine.stop();
    });
  });

  describe('degradación sin base local (Expo Go / web)', () => {
    it('usa SecureStore para borradores y cola pendiente cuando tryGetLocalDatabase devuelve null', async () => {
      testEnv.activeDb = null;

      const batch = makeBatchInput(31);
      const key = draftKey(USER_A, { alertId: ALERT_ID, childId: CHILD_ID });
      await saveDraft(key, {
        userId: USER_A,
        childId: CHILD_ID,
        alertId: ALERT_ID,
        form: {
          observations: 'Borrador en Expo Go',
          intervention: '',
          referral: '',
          nextCheckupText: '',
          establish: true,
        },
      });
      expect((await getDraft(key))?.form.observations).toBe('Borrador en Expo Go');

      testEnv.createFollowUpBatch.mockRejectedValueOnce(new FollowUpOfflineError());
      const submitted = await submitFollowUp({
        userId: USER_A,
        childId: CHILD_ID,
        alertId: ALERT_ID,
        establish: true,
        input: batch,
      });
      expect(submitted).toEqual({ kind: 'queued' });
      expect(await listPending(USER_A)).toHaveLength(1);

      // Ahora hay red: flushPendingFollowUps envía usando la cola de respaldo.
      testEnv.createFollowUpBatch.mockResolvedValueOnce([]);
      const flushed = await flushPendingFollowUps(USER_A);
      expect(flushed).toEqual({ sent: 1, remaining: 0, rejected: 0 });
      expect(await listPending(USER_A)).toHaveLength(0);

      await clearDraft(key);
      expect(await getDraft(key)).toBeNull();
      await clearDrafts();
    });
  });
});
