import type {
  CaregiverCheckupResponse,
  CheckupResponse,
  ChildResponse,
  IndicatorResult,
  OmsReferenceCurvesResponse,
  SyncCheckupItem,
} from '@nutrikids/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkupsRepository } from '../lib/local-db/checkups-repository.js';
import { childrenRepository } from '../lib/local-db/children-repository.js';
import { indicatorResultsRepository } from '../lib/local-db/indicator-results-repository.js';
import { metaRepository } from '../lib/local-db/meta-repository.js';
import { runMigrations } from '../lib/local-db/migrations.js';
import { referenceCurvesRepository } from '../lib/local-db/reference-curves-repository.js';
import { syncQueueRepository } from '../lib/local-db/sync-queue-repository.js';
import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CHILD_1 = '33333333-3333-4333-8333-333333333333';
const CHILD_2 = '44444444-4444-4444-8444-444444444444';
const CHECKUP_1 = '55555555-5555-4555-8555-555555555555';
const CHECKUP_2 = '66666666-6666-4666-8666-666666666666';
const RESULT_1 = '77777777-7777-4777-8777-777777777777';
const RESULT_2 = '88888888-8888-4888-8888-888888888888';
const FOLLOW_UP_1 = '99999999-9999-4999-8999-999999999999';
const FEEDING_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeChild(overrides: Partial<ChildResponse> = {}): ChildResponse {
  return {
    id: CHILD_1,
    firstName: 'Lucía',
    lastName: 'Mendoza',
    birthDate: '2024-03-15',
    sex: 'FEMALE',
    ...overrides,
  };
}

function makeProfessionalCheckup(overrides: Partial<CheckupResponse> = {}): CheckupResponse {
  return {
    id: CHECKUP_1,
    childId: CHILD_1,
    measuredAt: '2026-11-10T14:30:00.000Z',
    weightKg: 12.5,
    lengthHeightCm: 90,
    position: 'STANDING',
    origin: 'PROFESSIONAL',
    recordedById: USER_A,
    recordedBy: {
      userId: USER_A,
      firstName: 'Dra. Elena',
      lastName: 'Rojas',
      role: 'PROFESSIONAL',
      specialty: 'nutrition',
    },
    correctedCheckupId: null,
    isCurrent: true,
    notes: 'Buen apetito hoy',
    createdAt: '2026-11-10T14:31:00.000Z',
    results: [
      {
        id: RESULT_1,
        checkupId: CHECKUP_1,
        indicator: 'WEIGHT_FOR_AGE',
        zScore: -0.4,
        percentile: 34.5,
        classification: 'NORMAL',
        referenceVersion: 'WHO 2006',
      },
    ],
    ...overrides,
  };
}

describe('local-db repositories (node:sqlite)', () => {
  let db: SqliteTestDb;

  beforeEach(async () => {
    db = createSqliteTestDb();
    await runMigrations(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe('childrenRepository & user isolation', () => {
    it('upserts, lists, gets, and clears per user without leaking across users', async () => {
      const childA1 = makeChild({ id: CHILD_1, firstName: 'Lucía' });
      const childA2 = makeChild({ id: CHILD_2, firstName: 'Mateo', sex: 'MALE' });
      const childB1 = makeChild({ id: CHILD_1, firstName: 'Sofía' });

      await childrenRepository.upsertMany(db, USER_A, [childA1, childA2]);
      await childrenRepository.upsertMany(db, USER_B, [childB1]);

      const listA = await childrenRepository.list(db, USER_A);
      const listB = await childrenRepository.list(db, USER_B);

      expect(listA.map((c) => c.firstName).sort()).toEqual(['Lucía', 'Mateo']);
      expect(listB).toEqual([childB1]);
      expect(await childrenRepository.get(db, USER_A, CHILD_1)).toEqual(childA1);
      expect(await childrenRepository.get(db, USER_B, CHILD_2)).toBeNull();

      // Actualizar niño existente de USER_A no modifica al de USER_B aunque compartan id.
      const updatedA1 = makeChild({ id: CHILD_1, firstName: 'Lucía Valeria' });
      await childrenRepository.upsertMany(db, USER_A, [updatedA1]);
      expect(await childrenRepository.get(db, USER_A, CHILD_1)).toEqual(updatedA1);
      expect(await childrenRepository.get(db, USER_B, CHILD_1)).toEqual(childB1);

      await childrenRepository.clear(db, USER_A);
      expect(await childrenRepository.list(db, USER_A)).toEqual([]);
      expect(await childrenRepository.list(db, USER_B)).toEqual([childB1]);
    });

    it('omits corrupt payloads and logs only the table name without PII', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const validChild = makeChild({ id: CHILD_1, firstName: 'Camila', lastName: 'Pérez' });
      await childrenRepository.upsertMany(db, USER_A, [validChild]);

      // Inyectar un payload inválido con datos sensibles en SQLite para comprobar que no se loguea.
      await db.runAsync(
        `INSERT INTO children (user_id, id, payload, updated_at)
         VALUES (?, ?, ?, ?);`,
        [
          USER_A,
          CHILD_2,
          '{"firstName":"SecretoPII","birthDate":"bad-date"}',
          '2026-11-10T10:00:00.000Z',
        ],
      );
      await db.runAsync(
        `INSERT INTO children (user_id, id, payload, updated_at)
         VALUES (?, ?, ?, ?);`,
        [USER_A, '99999999-0000-4000-8000-000000000000', '{not-json', '2026-11-10T10:00:00.000Z'],
      );

      const children = await childrenRepository.list(db, USER_A);
      expect(children).toEqual([validChild]);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      for (const call of warnSpy.mock.calls) {
        const message = String(call[0]);
        expect(message).toContain('children');
        expect(message).not.toContain('SecretoPII');
        expect(message).not.toContain('bad-date');
        expect(message).not.toContain(CHILD_2);
      }
    });
  });

  describe('checkupsRepository', () => {
    it('lists checkups most recent first and handles insertLocal + markSent + delete', async () => {
      const localItem: SyncCheckupItem = {
        id: CHECKUP_1,
        childId: CHILD_1,
        measuredAt: '2026-11-10T14:30:00-05:00',
        weightKg: 12.5,
        lengthHeightCm: 90,
        position: 'STANDING',
        notes: 'Control sin conexión',
      };
      const olderServerItem: CaregiverCheckupResponse = {
        id: CHECKUP_2,
        childId: CHILD_1,
        measuredAt: '2026-10-01T10:00:00.000Z',
        weightKg: 12.0,
        lengthHeightCm: 89,
        position: 'STANDING',
        origin: 'CAREGIVER',
        recordedById: USER_A,
        recordedBy: null,
        correctedCheckupId: null,
        isCurrent: true,
        notes: null,
        createdAt: '2026-10-01T10:05:00.000Z',
      };

      await checkupsRepository.insertLocal(db, USER_A, localItem);
      await checkupsRepository.upsertMany(db, USER_A, [olderServerItem]);
      // Aislamiento: otro usuario con el mismo childId no debe aparecer.
      await checkupsRepository.upsertMany(db, USER_B, [
        makeProfessionalCheckup({ id: CHECKUP_1, childId: CHILD_1 }),
      ]);

      const stateBefore = await db.getFirstAsync<{ sync_state: string }>(
        'SELECT sync_state FROM checkups WHERE user_id = ? AND id = ?;',
        [USER_A, CHECKUP_1],
      );
      expect(stateBefore?.sync_state).toBe('LOCAL');

      const listedBefore = await checkupsRepository.listByChild(db, USER_A, CHILD_1);
      expect(listedBefore).toHaveLength(2);
      expect(listedBefore[0]?.id).toBe(CHECKUP_1);
      expect(listedBefore[1]?.id).toBe(CHECKUP_2);

      // Marcar como enviado con la versión autoritativa del servidor.
      const serverCheckup = makeProfessionalCheckup({
        id: CHECKUP_1,
        childId: CHILD_1,
        measuredAt: '2026-11-10T19:30:00.000Z',
        notes: 'Control sin conexión',
      });
      await checkupsRepository.markSent(db, USER_A, CHECKUP_1, serverCheckup);

      const stateAfter = await db.getFirstAsync<{ sync_state: string }>(
        'SELECT sync_state FROM checkups WHERE user_id = ? AND id = ?;',
        [USER_A, CHECKUP_1],
      );
      expect(stateAfter?.sync_state).toBe('SENT');

      const listedAfter = await checkupsRepository.listByChild(db, USER_A, CHILD_1);
      expect(listedAfter[0]).toEqual(serverCheckup);

      // Borrar en USER_A no borra el de USER_B.
      expect(await checkupsRepository.delete(db, USER_A, CHECKUP_1)).toBe(true);
      expect(await checkupsRepository.listByChild(db, USER_A, CHILD_1)).toEqual([olderServerItem]);
      expect(await checkupsRepository.listByChild(db, USER_B, CHILD_1)).toHaveLength(1);
    });

    it('omits corrupt checkup payloads without logging clinical info', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await db.runAsync(
        `INSERT INTO checkups (user_id, id, child_id, measured_at, payload, sync_state, created_at)
         VALUES (?, ?, ?, ?, ?, 'SENT', ?);`,
        [
          USER_A,
          CHECKUP_1,
          CHILD_1,
          '2026-11-10T10:00:00.000Z',
          '{"id":"not-uuid","notes":"Nota clínica privada 12.5kg"}',
          '2026-11-10T10:00:00.000Z',
        ],
      );

      const listed = await checkupsRepository.listByChild(db, USER_A, CHILD_1);
      expect(listed).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('checkups');
      expect(String(warnSpy.mock.calls[0]?.[0])).not.toContain('Nota clínica privada');
    });
  });

  describe('indicatorResultsRepository', () => {
    it('replaces and lists indicator results per user and checkup', async () => {
      const resultWfa: IndicatorResult = {
        id: RESULT_1,
        checkupId: CHECKUP_1,
        indicator: 'WEIGHT_FOR_AGE',
        zScore: -0.4,
        percentile: 34.5,
        classification: 'NORMAL',
        referenceVersion: 'WHO 2006',
      };
      const resultBmi: IndicatorResult = {
        id: RESULT_2,
        checkupId: CHECKUP_1,
        indicator: 'BMI_FOR_AGE',
        zScore: 0.2,
        percentile: 57.9,
        classification: 'NORMAL',
        referenceVersion: 'WHO 2006',
      };

      await indicatorResultsRepository.replaceForCheckup(db, USER_A, CHECKUP_1, [
        resultWfa,
        resultBmi,
      ]);
      await indicatorResultsRepository.replaceForCheckup(db, USER_B, CHECKUP_1, [
        {
          id: RESULT_1,
          checkupId: CHECKUP_1,
          indicator: 'WEIGHT_FOR_AGE',
          referenceVersion: 'WHO 2006',
        },
      ]);

      const listA = await indicatorResultsRepository.listForCheckup(db, USER_A, CHECKUP_1);
      expect(listA).toHaveLength(2);
      expect(listA.find((r) => r.indicator === 'WEIGHT_FOR_AGE')).toEqual(resultWfa);

      // Reemplazar con solo 1 resultado elimina el anterior para USER_A pero no toca USER_B.
      await indicatorResultsRepository.replaceForCheckup(db, USER_A, CHECKUP_1, [resultBmi]);
      const updatedListA = await indicatorResultsRepository.listForCheckup(db, USER_A, CHECKUP_1);
      const listB = await indicatorResultsRepository.listForCheckup(db, USER_B, CHECKUP_1);
      expect(updatedListA).toEqual([resultBmi]);
      expect(listB).toHaveLength(1);
    });
  });

  describe('referenceCurvesRepository', () => {
    it('stores and retrieves WHO public curves with fetched_at regardless of user', async () => {
      const curve: OmsReferenceCurvesResponse = {
        version: 'WHO 2006',
        indicator: 'WEIGHT_FOR_AGE',
        sex: 'FEMALE',
        xAxis: 'age_months',
        curves: {
          '-3': [{ x: 12, y: 6.3 }],
          '-2': [{ x: 12, y: 7.0 }],
          '0': [{ x: 12, y: 8.9 }],
          '+2': [{ x: 12, y: 11.5 }],
          '+3': [{ x: 12, y: 13.1 }],
        },
      };

      await referenceCurvesRepository.put(
        db,
        'WEIGHT_FOR_AGE',
        'FEMALE',
        null,
        curve,
        '2026-11-10T12:00:00.000Z',
      );

      const cached = await referenceCurvesRepository.get(db, 'WEIGHT_FOR_AGE', 'FEMALE', null);
      expect(cached).toEqual({
        curve,
        fetchedAt: '2026-11-10T12:00:00.000Z',
      });

      const missing = await referenceCurvesRepository.get(db, 'WEIGHT_FOR_AGE', 'MALE', null);
      expect(missing).toBeNull();
    });
  });

  describe('syncQueueRepository', () => {
    it('enqueues, queries, updates status, counts pending, and isolates users', async () => {
      const checkupPayload: SyncCheckupItem = {
        id: CHECKUP_1,
        childId: CHILD_1,
        measuredAt: '2026-11-10T14:30:00.000Z',
        weightKg: 12.5,
        lengthHeightCm: 90,
        position: 'STANDING',
      };

      const item1 = await syncQueueRepository.enqueue(db, USER_A, {
        kind: 'checkup',
        payload: checkupPayload,
      });
      const item2 = await syncQueueRepository.enqueue(db, USER_A, {
        kind: 'follow-up',
        payload: {
          id: FOLLOW_UP_1,
          childId: CHILD_1,
          type: 'recommendation',
          details: 'Aumentar hidratación',
        },
        nextAttemptAt: '2026-11-10T15:00:00.000Z',
      });
      await syncQueueRepository.enqueue(db, USER_B, {
        kind: 'feeding',
        payload: {
          id: FEEDING_1,
          childId: CHILD_2,
          logDate: '2026-11-10',
          mealsPerDay: 4,
        },
      });

      expect(item1.status).toBe('LOCAL');
      expect(item1.attempts).toBe(0);
      expect(await syncQueueRepository.countPending(db, USER_A)).toBe(2);
      expect(await syncQueueRepository.countPending(db, USER_B)).toBe(1);

      // Antes de las 15:00 solo está vencido item1 (next_attempt_at IS NULL).
      const dueBefore = await syncQueueRepository.listDue(db, USER_A, '2026-11-10T14:45:00.000Z');
      expect(dueBefore.map((i) => i.id)).toEqual([item1.id]);

      // A las 15:00 están vencidos ambos elementos de USER_A.
      const dueAt = await syncQueueRepository.listDue(db, USER_A, '2026-11-10T15:00:00.000Z');
      expect(dueAt.map((i) => i.id)).toEqual([item1.id, item2.id]);

      // USER_B no puede actualizar ni eliminar elementos de USER_A.
      expect(await syncQueueRepository.updateStatus(db, USER_B, item1.id, 'SENDING')).toBe(false);
      expect(await syncQueueRepository.remove(db, USER_B, item1.id)).toBe(false);

      // Transiciones de estado de item1 en USER_A.
      const sendingOk = await syncQueueRepository.updateStatus(db, USER_A, item1.id, 'SENDING', {
        attempts: 1,
      });
      expect(sendingOk).toBe(true);
      expect(await syncQueueRepository.countPending(db, USER_A)).toBe(2);

      const sentOk = await syncQueueRepository.updateStatus(db, USER_A, item1.id, 'SENT', {
        nextAttemptAt: null,
        lastError: null,
      });
      expect(sentOk).toBe(true);
      expect(await syncQueueRepository.countPending(db, USER_A)).toBe(1);

      const errorOk = await syncQueueRepository.updateStatus(db, USER_A, item2.id, 'ERROR', {
        attempts: 1,
        lastError: 'HTTP 403',
      });
      expect(errorOk).toBe(true);
      expect(await syncQueueRepository.countPending(db, USER_A)).toBe(0);

      const errorItems = await syncQueueRepository.listByStatus(db, USER_A, 'ERROR');
      expect(errorItems).toHaveLength(1);
      expect(errorItems[0]?.lastError).toBe('HTTP 403');
      expect(errorItems[0]?.attempts).toBe(1);

      expect(await syncQueueRepository.remove(db, USER_A, item1.id)).toBe(true);
      expect(await syncQueueRepository.listByStatus(db, USER_A, 'SENT')).toEqual([]);
    });

    it('omits corrupt sync_queue rows and logs only the table name without PII', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await db.runAsync(
        `INSERT INTO sync_queue (
           id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
         )
         VALUES (?, ?, 'checkup', ?, 'LOCAL', 0, NULL, NULL, ?, ?);`,
        [
          CHECKUP_1,
          USER_A,
          '{"notes":"Dato privado del niño"}',
          '2026-11-10T10:00:00.000Z',
          '2026-11-10T10:00:00.000Z',
        ],
      );

      expect(await syncQueueRepository.listByStatus(db, USER_A, 'LOCAL')).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('sync_queue');
      expect(String(warnSpy.mock.calls[0]?.[0])).not.toContain('Dato privado');
    });
  });

  describe('metaRepository', () => {
    it('gets, sets, updates, and removes metadata keys', async () => {
      expect(await metaRepository.get(db, 'last_sync')).toBeNull();

      await metaRepository.set(db, 'last_sync', '2026-11-10T12:00:00.000Z');
      expect(await metaRepository.get(db, 'last_sync')).toBe('2026-11-10T12:00:00.000Z');

      await metaRepository.set(db, 'last_sync', '2026-11-10T13:00:00.000Z');
      expect(await metaRepository.get(db, 'last_sync')).toBe('2026-11-10T13:00:00.000Z');

      await metaRepository.remove(db, 'last_sync');
      expect(await metaRepository.get(db, 'last_sync')).toBeNull();
    });
  });
});
