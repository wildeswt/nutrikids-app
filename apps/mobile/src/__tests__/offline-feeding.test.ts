import type {
  CaregiverCheckupResponse,
  CreateCheckupInput,
  CreateFeedingLogInput,
  FeedingLogResponse,
  SyncCheckupItem,
} from '@nutrikids/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkupsRepository,
  childrenRepository,
  metaRepository,
  runMigrations,
  syncQueueRepository,
} from '../lib/local-db/index.js';
import { FeedingApiError } from '../lib/feeding-api.js';
import type { FollowUpBatchRequest } from '../lib/follow-up-alert.js';
import { buildSyncCheckupItem, saveCheckupLocallyInDb } from '../lib/offline-checkup.js';
import {
  OfflineFeedingSaveError,
  createFeedingWithOfflineFallback,
  saveFeedingLocallyInDb,
} from '../lib/offline-feeding.js';
import {
  discardPendingSyncItemInDb,
  listPendingSyncItemsInDb,
  retryPendingSyncItemInDb,
} from '../lib/pending-sync.js';
import {
  SYNC_QUEUE_PROCESSORS,
  flushFeedingQueue,
  flushSyncQueue,
  syncLastSyncedMetaKey,
} from '../lib/sync/index.js';
import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const CHILD_A = '20000000-0000-4000-8000-00000000000a';
const CHILD_UNKNOWN = '20000000-0000-4000-8000-0000000000ff';

const FEED_1 = '30000000-0000-4000-8000-000000000001';
const FEED_2 = '30000000-0000-4000-8000-000000000002';
const CHECKUP_1 = '40000000-0000-4000-8000-000000000001';
const FOLLOWUP_1 = '50000000-0000-4000-8000-000000000001';

function makeFeedingInput(overrides: Partial<CreateFeedingLogInput> = {}): CreateFeedingLogInput {
  return {
    id: FEED_1,
    logDate: '2026-10-18',
    mealsPerDay: 3,
    details: 'Comidas: Desayuno, Almuerzo, Cena.',
    ...overrides,
  };
}

function makeFeedingResponse(childId: string, input: CreateFeedingLogInput): FeedingLogResponse {
  return {
    id: input.id,
    childId,
    logDate: input.logDate,
    mealsPerDay: input.mealsPerDay,
    details: input.details ?? null,
  };
}

function makeCheckupInput(overrides: Partial<CreateCheckupInput> = {}): CreateCheckupInput {
  return {
    id: CHECKUP_1,
    measuredAt: '2026-10-18T10:00:00.000Z',
    weightKg: 12.4,
    lengthHeightCm: 88.5,
    position: 'STANDING',
    ...overrides,
  };
}

describe('offline feeding & feeding processor (NK-62B)', () => {
  let db: SqliteTestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await runMigrations(db);
    await childrenRepository.upsertMany(db, USER_ID, [
      {
        id: CHILD_A,
        firstName: 'Mateo',
        lastName: 'Rodríguez',
        birthDate: '2024-01-15',
        sex: 'MALE',
      },
    ]);
  });

  afterEach(() => {
    db.close();
  });

  describe('SYNC_QUEUE_PROCESSORS feeding', () => {
    it('registra feeding en SYNC_QUEUE_PROCESSORS y sincroniza en 200/201 actualizando lastSyncedAt', async () => {
      expect(typeof SYNC_QUEUE_PROCESSORS.feeding).toBe('function');

      await saveFeedingLocallyInDb(db, USER_ID, CHILD_A, makeFeedingInput({ id: FEED_1 }));
      const sentCalls: Array<{ childId: string; input: CreateFeedingLogInput }> = [];

      const summary = await flushFeedingQueue({
        db,
        userId: USER_ID,
        now: '2026-10-18T12:00:00.000Z',
        sendFeeding: async (childId, input) => {
          sentCalls.push({ childId, input });
          return makeFeedingResponse(childId, input);
        },
      });

      expect(summary).toEqual({
        attempted: 1,
        synced: 1,
        failedPermanent: 0,
        deferredRetry: 0,
        batches: 1,
      });
      expect(sentCalls).toEqual([
        {
          childId: CHILD_A,
          input: makeFeedingInput({ id: FEED_1 }),
        },
      ]);

      const record = await syncQueueRepository.getById(db, USER_ID, FEED_1);
      expect(record?.status).toBe('SENT');
      expect(record?.lastError).toBeNull();
      expect(record?.nextAttemptAt).toBeNull();

      const lastSynced = await metaRepository.get(db, syncLastSyncedMetaKey(USER_ID));
      expect(lastSynced).toBe('2026-10-18T12:00:00.000Z');
    });

    it('marca ERROR con el mensaje del servidor y sin reintento ante 4xx definitivo', async () => {
      await saveFeedingLocallyInDb(db, USER_ID, CHILD_A, makeFeedingInput({ id: FEED_1 }));
      await saveFeedingLocallyInDb(
        db,
        USER_ID,
        CHILD_A,
        makeFeedingInput({ id: FEED_2, mealsPerDay: 2 }),
      );

      let calls = 0;
      const summary = await flushFeedingQueue({
        db,
        userId: USER_ID,
        now: '2026-10-18T12:00:00.000Z',
        sendFeeding: async (childId, input) => {
          calls += 1;
          if (input.id === FEED_1) {
            throw new FeedingApiError('Falta consentimiento vigente', 403);
          }
          return makeFeedingResponse(childId, input);
        },
      });

      expect(calls).toBe(2);
      expect(summary.failedPermanent).toBe(1);
      expect(summary.synced).toBe(1);

      const errRecord = await syncQueueRepository.getById(db, USER_ID, FEED_1);
      expect(errRecord?.status).toBe('ERROR');
      expect(errRecord?.lastError).toBe('Falta consentimiento vigente');
      expect(errRecord?.nextAttemptAt).toBeNull();

      // Un segundo ciclo nunca debe reintentar el 4xx definitivo automáticamente.
      const sendAgain = vi.fn(async (childId: string, input: CreateFeedingLogInput) =>
        makeFeedingResponse(childId, input),
      );
      const second = await flushFeedingQueue({
        db,
        userId: USER_ID,
        now: '2026-10-19T12:00:00.000Z',
        sendFeeding: sendAgain,
      });
      expect(second.attempted).toBe(0);
      expect(sendAgain).not.toHaveBeenCalled();
    });

    it('aplica espera creciente en fallos de red/5xx/408/429 y reenvía idempotente con el mismo id', async () => {
      await saveFeedingLocallyInDb(db, USER_ID, CHILD_A, makeFeedingInput({ id: FEED_1 }));
      const sentIds: string[] = [];

      // Primer fallo: error de red (`FeedingApiError` con isNetwork: true, status 0)
      const firstSummary = await flushFeedingQueue({
        db,
        userId: USER_ID,
        now: '2026-10-18T12:00:00.000Z',
        random: () => 0.5,
        sendFeeding: async (_childId, input) => {
          sentIds.push(input.id);
          throw new FeedingApiError('Sin conexión', 0, { isNetwork: true });
        },
      });

      expect(firstSummary.deferredRetry).toBe(1);
      const afterNetErr = await syncQueueRepository.getById(db, USER_ID, FEED_1);
      expect(afterNetErr?.status).toBe('LOCAL');
      expect(afterNetErr?.attempts).toBe(1);
      expect(afterNetErr?.nextAttemptAt).not.toBeNull();
      const firstNextAttempt = Date.parse(afterNetErr!.nextAttemptAt!);

      // Antes de que venza `nextAttemptAt` no debe enviarse automáticamente
      const earlySend = vi.fn(async (childId: string, input: CreateFeedingLogInput) =>
        makeFeedingResponse(childId, input),
      );
      await flushFeedingQueue({
        db,
        userId: USER_ID,
        now: new Date(firstNextAttempt - 1000).toISOString(),
        sendFeeding: earlySend,
      });
      expect(earlySend).not.toHaveBeenCalled();

      // Segundo fallo al vencer: HTTP 503 aumenta attempts a 2 y la espera
      await flushFeedingQueue({
        db,
        userId: USER_ID,
        now: new Date(firstNextAttempt + 1000).toISOString(),
        random: () => 0.5,
        sendFeeding: async (_childId, input) => {
          sentIds.push(input.id);
          throw new FeedingApiError('Servidor ocupado', 503);
        },
      });
      const after503 = await syncQueueRepository.getById(db, USER_ID, FEED_1);
      expect(after503?.attempts).toBe(2);
      expect(Date.parse(after503!.nextAttemptAt!) - (firstNextAttempt + 1000)).toBeGreaterThan(
        firstNextAttempt - Date.parse('2026-10-18T12:00:00.000Z'),
      );

      // Reenvío al reconectar: exactamente el mismo id
      const thirdSummary = await flushFeedingQueue({
        db,
        userId: USER_ID,
        now: new Date(Date.parse(after503!.nextAttemptAt!) + 1000).toISOString(),
        sendFeeding: async (childId, input) => {
          sentIds.push(input.id);
          return makeFeedingResponse(childId, input);
        },
      });
      expect(thirdSummary.synced).toBe(1);
      expect(sentIds).toEqual([FEED_1, FEED_1, FEED_1]);
      expect((await syncQueueRepository.getById(db, USER_ID, FEED_1))?.status).toBe('SENT');
    });

    it('procesa una cola mixta con checkup, follow-up y feeding en un mismo flushSyncQueue', async () => {
      await saveCheckupLocallyInDb(
        db,
        USER_ID,
        buildSyncCheckupItem(CHILD_A, makeCheckupInput({ id: CHECKUP_1 })),
      );
      await syncQueueRepository.enqueue(db, USER_ID, {
        id: FOLLOWUP_1,
        kind: 'follow-up',
        payload: {
          childId: CHILD_A,
          establish: false,
          batch: {
            nextCheckupDate: '2026-11-20',
            items: [{ id: FOLLOWUP_1, type: 'observation', details: 'Control nutricional' }],
          },
        },
      });
      await saveFeedingLocallyInDb(db, USER_ID, CHILD_A, makeFeedingInput({ id: FEED_1 }));

      const postedCheckups: SyncCheckupItem[] = [];
      const sentFollowUps: FollowUpBatchRequest[] = [];
      const sentFeedings: Array<{ childId: string; input: CreateFeedingLogInput }> = [];

      const summary = await flushSyncQueue({
        db,
        userId: USER_ID,
        now: '2026-10-18T15:00:00.000Z',
        post: async (items) => {
          postedCheckups.push(...items);
          return {
            results: items.map((item) => ({
              id: item.id,
              status: 'CREATED' as const,
              checkup: {
                id: item.id,
                childId: item.childId,
                measuredAt: item.measuredAt,
                weightKg: item.weightKg,
                lengthHeightCm: item.lengthHeightCm,
                position: item.position,
                origin: 'CAREGIVER',
                recordedById: USER_ID,
                recordedBy: null,
                correctedCheckupId: null,
                isCurrent: true,
                notes: null,
                createdAt: '2026-10-18T15:00:00.000Z',
              } satisfies CaregiverCheckupResponse,
            })),
          };
        },
        sendFollowUp: async (req) => {
          sentFollowUps.push(req);
          return { kind: 'sent', followUps: [], alertStatus: null };
        },
        sendFeeding: async (childId, input) => {
          sentFeedings.push({ childId, input });
          return makeFeedingResponse(childId, input);
        },
      });

      expect(summary.synced).toBe(3);
      expect(summary.failedPermanent).toBe(0);
      expect(summary.deferredRetry).toBe(0);
      expect(postedCheckups.map((item) => item.id)).toEqual([CHECKUP_1]);
      expect(sentFollowUps).toHaveLength(1);
      expect(sentFeedings.map((item) => item.input.id)).toEqual([FEED_1]);
    });
  });

  describe('createFeedingWithOfflineFallback', () => {
    it('sin conexión guarda en cola local atómicamente con el mismo id y marca savedLocally', async () => {
      const refreshSyncState = vi.fn(async () => {});
      const createRemote = vi.fn();
      const input = makeFeedingInput({ id: FEED_1 });

      const result = await createFeedingWithOfflineFallback({
        userId: USER_ID,
        childId: CHILD_A,
        input,
        isOnline: false,
        deps: {
          getDb: async () => db,
          createRemote,
          refreshSyncState,
        },
      });

      expect(createRemote).not.toHaveBeenCalled();
      expect(result.savedLocally).toBe(true);
      expect(result.id).toBe(FEED_1);
      expect(refreshSyncState).toHaveBeenCalledTimes(1);

      const queued = await syncQueueRepository.getById(db, USER_ID, FEED_1);
      expect(queued?.kind).toBe('feeding');
      expect(queued?.status).toBe('LOCAL');
      expect(queued?.payload).toEqual({ ...input, childId: CHILD_A });
    });

    it('en línea ante fallo de red cae a cola local con el mismo id y dispara syncNow', async () => {
      const syncNow = vi.fn(async () => {});
      const input = makeFeedingInput({ id: FEED_2 });

      const result = await createFeedingWithOfflineFallback({
        userId: USER_ID,
        childId: CHILD_A,
        input,
        isOnline: true,
        deps: {
          getDb: async () => db,
          syncNow,
          createRemote: async () => {
            throw new FeedingApiError('Sin internet', 0, { isNetwork: true });
          },
        },
      });

      expect(result.savedLocally).toBe(true);
      expect(result.id).toBe(FEED_2);
      expect(syncNow).toHaveBeenCalledTimes(1);
      const queued = await syncQueueRepository.getById(db, USER_ID, FEED_2);
      expect(queued?.kind).toBe('feeding');
    });

    it('nunca cae a cola local ante error HTTP 4xx', async () => {
      const input = makeFeedingInput({ id: FEED_1 });

      await expect(
        createFeedingWithOfflineFallback({
          userId: USER_ID,
          childId: CHILD_A,
          input,
          isOnline: true,
          deps: {
            getDb: async () => db,
            createRemote: async () => {
              throw new FeedingApiError('Falta consentimiento vigente', 403);
            },
          },
        }),
      ).rejects.toThrow('Falta consentimiento vigente');

      expect(await syncQueueRepository.getById(db, USER_ID, FEED_1)).toBeNull();
    });

    it('sin base local disponible conserva el error de red original', async () => {
      await expect(
        createFeedingWithOfflineFallback({
          userId: USER_ID,
          childId: CHILD_A,
          input: makeFeedingInput({ id: FEED_1 }),
          isOnline: false,
          deps: {
            getDb: async () => null,
          },
        }),
      ).rejects.toBeInstanceOf(OfflineFeedingSaveError);
    });
  });

  describe('listPendingSyncItemsInDb, retry y discard por tipo', () => {
    it('lista checkup, follow-up y feeding con nombre del niño o «Paciente» si falta', async () => {
      await saveCheckupLocallyInDb(
        db,
        USER_ID,
        buildSyncCheckupItem(CHILD_A, makeCheckupInput({ id: CHECKUP_1 })),
      );
      await syncQueueRepository.enqueue(db, USER_ID, {
        id: FOLLOWUP_1,
        kind: 'follow-up',
        payload: {
          childId: CHILD_A,
          establish: true,
          alertId: '60000000-0000-4000-8000-000000000001',
          batch: {
            nextCheckupDate: '2026-11-25',
            items: [
              { id: FOLLOWUP_1, type: 'observation', details: 'Obs 1' },
              {
                id: '50000000-0000-4000-8000-000000000002',
                type: 'intervention',
                details: 'Int 1',
              },
            ],
          },
        },
      });
      await saveFeedingLocallyInDb(
        db,
        USER_ID,
        CHILD_UNKNOWN,
        makeFeedingInput({ id: FEED_1, mealsPerDay: 4 }),
      );

      const items = await listPendingSyncItemsInDb(db, USER_ID);
      expect(items).toHaveLength(3);

      const checkupItem = items.find((i) => i.id === CHECKUP_1);
      const followUpItem = items.find((i) => i.id === FOLLOWUP_1);
      const feedingItem = items.find((i) => i.id === FEED_1);

      expect(checkupItem?.kind).toBe('checkup');
      expect(checkupItem?.childName).toBe('Mateo');
      expect(followUpItem).toMatchObject({
        kind: 'follow-up',
        childName: 'Mateo',
        itemCount: 2,
        nextCheckupDate: '2026-11-25',
      });
      expect(feedingItem).toMatchObject({
        kind: 'feeding',
        childName: 'Paciente',
        logDate: '2026-10-18',
        mealsPerDay: 4,
      });
    });

    it('reintentar reinicia cualquier tipo a LOCAL y descartar borra cola (y control LOCAL si es checkup)', async () => {
      await saveCheckupLocallyInDb(
        db,
        USER_ID,
        buildSyncCheckupItem(CHILD_A, makeCheckupInput({ id: CHECKUP_1 })),
      );
      await saveFeedingLocallyInDb(db, USER_ID, CHILD_A, makeFeedingInput({ id: FEED_1 }));
      await syncQueueRepository.enqueue(db, USER_ID, {
        id: FOLLOWUP_1,
        kind: 'follow-up',
        payload: {
          childId: CHILD_A,
          establish: false,
          batch: { items: [{ id: FOLLOWUP_1, type: 'observation', details: 'Obs' }] },
        },
      });

      await syncQueueRepository.updateStatus(db, USER_ID, FEED_1, 'ERROR', {
        attempts: 3,
        nextAttemptAt: '2026-10-20T00:00:00.000Z',
        lastError: 'Fallo temporal',
      });
      await retryPendingSyncItemInDb(db, USER_ID, FEED_1);

      const retriedFeeding = await syncQueueRepository.getById(db, USER_ID, FEED_1);
      expect(retriedFeeding?.status).toBe('LOCAL');
      expect(retriedFeeding?.attempts).toBe(0);
      expect(retriedFeeding?.nextAttemptAt).toBeNull();
      expect(retriedFeeding?.lastError).toBeNull();

      await discardPendingSyncItemInDb(db, USER_ID, FEED_1);
      await discardPendingSyncItemInDb(db, USER_ID, FOLLOWUP_1);
      await discardPendingSyncItemInDb(db, USER_ID, CHECKUP_1);

      expect(await syncQueueRepository.getById(db, USER_ID, FEED_1)).toBeNull();
      expect(await syncQueueRepository.getById(db, USER_ID, FOLLOWUP_1)).toBeNull();
      expect(await syncQueueRepository.getById(db, USER_ID, CHECKUP_1)).toBeNull();
      expect(await checkupsRepository.listEntriesByChild(db, USER_ID, CHILD_A)).toHaveLength(0);
    });
  });
});
