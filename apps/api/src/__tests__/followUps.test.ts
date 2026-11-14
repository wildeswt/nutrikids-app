import crypto from 'node:crypto';
import {
  FollowUpResponseSchema,
  type AlertResponse,
  type FollowUpResponse,
} from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { reminderScheduledFor } from '../services/followUps.service.js';
import { signAccessToken } from '../services/token.service.js';

/**
 * Seguimientos clínicos (RF-15): `POST /children/:childId/follow-ups`.
 * Cada test usa usuarios y niños propios (controles y alert_history son inmutables).
 */

describe('reminderScheduledFor (unidad)', () => {
  it('programa el recordatorio a las 09:00 de Caracas (13:00Z) del día del control', () => {
    expect(reminderScheduledFor('2026-12-01').toISOString()).toBe('2026-12-01T13:00:00.000Z');
  });
});

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

function isoDateMonthsAgo(monthsAgo: number): string {
  const now = new Date();
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - monthsAgo;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), maxDay)))
    .toISOString()
    .slice(0, 10);
}

function isoDateDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

type Specialty = 'nursing' | 'nutrition' | 'pediatrics';

describe('Follow-ups API (/children/:childId/follow-ups)', { timeout: 60000 }, () => {
  const app = createApp();
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminConnectionString });
    await admin.connect();
  });

  afterAll(async () => {
    await admin?.end();
    await prisma.$disconnect();
  });

  interface TestUser {
    userId: string;
    token: string;
  }

  async function createUser(
    role: 'CAREGIVER' | 'PROFESSIONAL',
    specialty: Specialty = 'pediatrics',
  ): Promise<TestUser> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', 'Test', 'User', 'active', now())`,
      [userId, `followups-${userId}@nutrikids.local`],
    );
    if (role === 'CAREGIVER') {
      await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+593990000')`, [
        userId,
      ]);
    } else {
      await admin.query(
        `INSERT INTO professionals (user_id, specialty, license_number) VALUES ($1, $2, $3)`,
        [userId, specialty, `LIC-${userId.slice(0, 8)}`],
      );
    }
    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: [role],
      specialty: role === 'PROFESSIONAL' ? specialty : null,
    });
    return { userId, token: `Bearer ${accessToken}` };
  }

  async function seedChild(caregiverId: string, withConsent = true): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, 'Lucía', 'Test', $2::date, 'FEMALE')`,
      [childId, isoDateMonthsAgo(30)],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', true)`,
      [caregiverId, childId],
    );
    if (withConsent) {
      await admin.query(
        `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
        [crypto.randomUUID(), childId, caregiverId],
      );
    }
    return childId;
  }

  async function linkProfessional(childId: string, professionalId: string, ended = false) {
    await admin.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 30, CASE WHEN $4::boolean THEN CURRENT_DATE - 1 END)`,
      [crypto.randomUUID(), childId, professionalId, ended],
    );
  }

  async function setup() {
    const caregiver = await createUser('CAREGIVER');
    const professional = await createUser('PROFESSIONAL');
    const childId = await seedChild(caregiver.userId);
    await linkProfessional(childId, professional.userId);
    return { caregiver, professional, childId };
  }

  const postFollowUp = (user: TestUser, childId: string, body: Record<string, unknown>) =>
    request(app)
      .post(`/children/${childId}/follow-ups`)
      .set('Authorization', user.token)
      .send(body);

  const postFollowUpBatch = (user: TestUser, childId: string, body: Record<string, unknown>) =>
    request(app)
      .post(`/children/${childId}/follow-ups/batch`)
      .set('Authorization', user.token)
      .send(body);

  const baseBody = (extra: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    type: 'recommendation',
    details: 'Añadir una merienda con proteína',
    ...extra,
  });

  const batchBody = (itemsCount = 2, extra: Record<string, unknown> = {}) => {
    const types: ('observation' | 'intervention' | 'referral' | 'recommendation')[] = [
      'observation',
      'intervention',
      'referral',
      'recommendation',
    ];
    const items = Array.from({ length: itemsCount }, (_, i) => ({
      id: crypto.randomUUID(),
      type: types[i]!,
      details: `Detalle del seguimiento ${types[i]}`,
    }));
    return {
      items,
      ...extra,
    };
  };

  async function remindersFor(followUpId: string) {
    const { rows } = await admin.query(
      `SELECT id, child_id, type, status, scheduled_for FROM reminders WHERE follow_up_id = $1`,
      [followUpId],
    );
    return rows as {
      id: string;
      child_id: string;
      type: string;
      status: string;
      scheduled_for: Date;
    }[];
  }

  /** Alerta P/T grave entregada al profesional (PENDING_REVIEW). 9 kg / 90 cm a los 30 meses. */
  async function wastingAlert(user: TestUser, childId: string): Promise<AlertResponse> {
    const checkup = await request(app)
      .post(`/children/${childId}/checkups`)
      .set('Authorization', user.token)
      .send({
        id: crypto.randomUUID(),
        measuredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        weightKg: 9,
        lengthHeightCm: 90,
        position: 'STANDING',
      });
    expect(checkup.status).toBe(201);
    const res = await request(app)
      .get(`/alerts?childId=${childId}`)
      .set('Authorization', user.token);
    const alert = (res.body as AlertResponse[]).find(
      (a) => a.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT',
    );
    expect(alert).toBeDefined();
    return alert!;
  }

  describe('registro', () => {
    it('crea el seguimiento y el recordatorio del próximo control', async () => {
      const { professional, childId } = await setup();
      const nextCheckupDate = isoDateDaysFromNow(14);
      const res = await postFollowUp(
        professional,
        childId,
        baseBody({ type: 'referral', nextCheckupDate }),
      );

      expect(res.status).toBe(201);
      const body = FollowUpResponseSchema.parse(res.body);
      expect(body).toMatchObject({
        childId,
        alertId: null,
        professionalId: professional.userId,
        type: 'referral',
        details: 'Añadir una merienda con proteína',
        nextCheckupDate,
      });
      expect(body.reminder).toMatchObject({
        childId,
        type: 'next_checkup',
        status: 'pending',
        scheduledFor: reminderScheduledFor(nextCheckupDate).toISOString(),
      });

      const reminders = await remindersFor(body.id);
      expect(reminders).toHaveLength(1);
      expect(reminders[0]!.id).toBe(body.reminder!.id);
      expect(reminders[0]!.scheduled_for.toISOString()).toBe(body.reminder!.scheduledFor);
    });

    it.each(['observation', 'recommendation', 'intervention', 'referral'])(
      'acepta el tipo %s sin próximo control (sin recordatorio)',
      async (type) => {
        const { professional, childId } = await setup();
        const res = await postFollowUp(professional, childId, baseBody({ type }));
        expect(res.status).toBe(201);
        const body = res.body as FollowUpResponse;
        expect(body.type).toBe(type);
        expect(body.nextCheckupDate).toBeNull();
        expect(body.reminder).toBeNull();
        expect(await remindersFor(body.id)).toHaveLength(0);
      },
    );

    it('acepta el próximo control para hoy', async () => {
      const { professional, childId } = await setup();
      const res = await postFollowUp(
        professional,
        childId,
        baseBody({ nextCheckupDate: isoDateDaysFromNow(0) }),
      );
      expect(res.status).toBe(201);
    });

    it('reenviar el mismo id devuelve el existente (200) sin duplicar el recordatorio', async () => {
      const { professional, childId } = await setup();
      const body = baseBody({ nextCheckupDate: isoDateDaysFromNow(7) });

      const first = await postFollowUp(professional, childId, body);
      expect(first.status).toBe(201);
      const again = await postFollowUp(professional, childId, body);
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(await remindersFor(body.id)).toHaveLength(1);
    });

    it('reusar el id en otro niño responde 409', async () => {
      const { caregiver, professional, childId } = await setup();
      const otherChild = await seedChild(caregiver.userId);
      await linkProfessional(otherChild, professional.userId);
      const body = baseBody();

      expect((await postFollowUp(professional, childId, body)).status).toBe(201);
      expect((await postFollowUp(professional, otherChild, body)).status).toBe(409);
    });

    it('registra la creación en la auditoría', async () => {
      const { professional, childId } = await setup();
      const res = await postFollowUp(professional, childId, baseBody());
      expect(res.status).toBe(201);

      let count = 0;
      for (let i = 0; i < 20 && count === 0; i += 1) {
        const { rows } = await admin.query(
          `SELECT count(*)::int AS n FROM audit_logs
            WHERE user_id = $1 AND action = 'CREATE' AND entity_type = 'follow_ups' AND entity_id = $2`,
          [professional.userId, res.body.id],
        );
        count = rows[0].n as number;
        if (count === 0) await new Promise((r) => setTimeout(r, 100));
      }
      expect(count).toBe(1);
    });
  });

  describe('vínculo con alertas', () => {
    it('referencia una alerta del niño y permite marcar «seguimiento establecido»', async () => {
      const { professional, childId } = await setup();
      const alert = await wastingAlert(professional, childId);

      const res = await postFollowUp(
        professional,
        childId,
        baseBody({ type: 'intervention', alertId: alert.id }),
      );
      expect(res.status).toBe(201);
      expect(res.body.alertId).toBe(alert.id);

      // El seguimiento no cambia el estado de la alerta por sí solo.
      const detail = await request(app)
        .get(`/alerts/${alert.id}`)
        .set('Authorization', professional.token);
      expect(detail.body.status).toBe('PENDING_REVIEW');

      const patch = (status: string) =>
        request(app)
          .patch(`/alerts/${alert.id}/status`)
          .set('Authorization', professional.token)
          .send({ status });
      expect((await patch('REVIEWED')).status).toBe(200);
      const done = await patch('FOLLOW_UP_ESTABLISHED');
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('FOLLOW_UP_ESTABLISHED');
    });

    it('rechaza una alerta de otro niño (400)', async () => {
      const { caregiver, professional, childId } = await setup();
      const otherChild = await seedChild(caregiver.userId);
      await linkProfessional(otherChild, professional.userId);
      const alert = await wastingAlert(professional, otherChild);

      const res = await postFollowUp(professional, childId, baseBody({ alertId: alert.id }));
      expect(res.status).toBe(400);
    });

    it('responde 404 si la alerta no existe', async () => {
      const { professional, childId } = await setup();
      const res = await postFollowUp(
        professional,
        childId,
        baseBody({ alertId: crypto.randomUUID() }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe('validación', () => {
    it('rechaza un próximo control en el pasado', async () => {
      const { professional, childId } = await setup();
      const res = await postFollowUp(
        professional,
        childId,
        baseBody({ nextCheckupDate: isoDateDaysFromNow(-1) }),
      );
      expect(res.status).toBe(400);
    });

    it.each([
      ['tipo desconocido', { type: 'diagnosis' }],
      ['detalle vacío', { details: '  ' }],
      ['fecha inválida', { nextCheckupDate: '01/12/2026' }],
      ['campo no permitido', { professionalId: crypto.randomUUID() }],
    ])('rechaza %s (400)', async (_label, extra) => {
      const { professional, childId } = await setup();
      const res = await postFollowUp(professional, childId, baseBody(extra));
      expect(res.status).toBe(400);
    });
  });

  describe('acceso', () => {
    it('el cuidador no puede registrar seguimientos', async () => {
      const { caregiver, childId } = await setup();
      expect((await postFollowUp(caregiver, childId, baseBody())).status).toBe(403);
    });

    it('enfermería no tiene el permiso followup:create', async () => {
      const { childId } = await setup();
      const nurse = await createUser('PROFESSIONAL', 'nursing');
      await linkProfessional(childId, nurse.userId);
      expect((await postFollowUp(nurse, childId, baseBody())).status).toBe(403);
    });

    it('nutrición sí puede registrar seguimientos', async () => {
      const { childId } = await setup();
      const nutritionist = await createUser('PROFESSIONAL', 'nutrition');
      await linkProfessional(childId, nutritionist.userId);
      expect((await postFollowUp(nutritionist, childId, baseBody())).status).toBe(201);
    });

    it('un profesional sin vínculo o con vínculo vencido recibe 403', async () => {
      const { childId } = await setup();
      const stranger = await createUser('PROFESSIONAL');
      const former = await createUser('PROFESSIONAL');
      await linkProfessional(childId, former.userId, true);
      expect((await postFollowUp(stranger, childId, baseBody())).status).toBe(403);
      expect((await postFollowUp(former, childId, baseBody())).status).toBe(403);
    });

    it('sin consentimiento vigente responde 403', async () => {
      const caregiver = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId, false);
      await linkProfessional(childId, professional.userId);
      expect((await postFollowUp(professional, childId, baseBody())).status).toBe(403);
    });

    it('sin token responde 401', async () => {
      const { childId } = await setup();
      const res = await request(app).post(`/children/${childId}/follow-ups`).send(baseBody());
      expect(res.status).toBe(401);
    });
  });

  describe('lote de seguimientos (POST /children/:childId/follow-ups/batch, NK-75)', () => {
    it('crea 1, 2 y 3 seguimientos con el mismo groupId derivado deterministamente', async () => {
      const { professional, childId } = await setup();

      // 1 ítem: groupId derivado de items[0].id
      const b1 = batchBody(1);
      const res1 = await postFollowUpBatch(professional, childId, b1);
      expect(res1.status).toBe(201);
      expect(res1.body).toHaveLength(1);
      expect(res1.body[0].id).toBe(b1.items[0]!.id);
      expect(res1.body[0].groupId).toBe(b1.items[0]!.id);

      // 2 ítems con groupId explícito
      const explicitGroupId = crypto.randomUUID();
      const b2 = batchBody(2, { groupId: explicitGroupId });
      const res2 = await postFollowUpBatch(professional, childId, b2);
      expect(res2.status).toBe(201);
      expect(res2.body).toHaveLength(2);
      expect(res2.body[0].groupId).toBe(explicitGroupId);
      expect(res2.body[1].groupId).toBe(explicitGroupId);

      // 3 ítems con próximo control y alerta: un solo recordatorio vinculado a items[0]
      const alert = await wastingAlert(professional, childId);
      const nextCheckupDate = isoDateDaysFromNow(10);
      const b3 = batchBody(3, { alertId: alert.id, nextCheckupDate });
      const res3 = await postFollowUpBatch(professional, childId, b3);
      expect(res3.status).toBe(201);
      expect(res3.body).toHaveLength(3);
      const expectedGroupId = b3.items[0]!.id;
      for (const item of res3.body) {
        expect(item.groupId).toBe(expectedGroupId);
        expect(item.alertId).toBe(alert.id);
        expect(item.nextCheckupDate).toBe(nextCheckupDate);
      }
      expect(res3.body[0].reminder).not.toBeNull();
      expect(res3.body[0].reminder.type).toBe('next_checkup');
      expect(res3.body[1].reminder).toBeNull();
      expect(res3.body[2].reminder).toBeNull();

      const reminders = await remindersFor(b3.items[0]!.id);
      expect(reminders).toHaveLength(1);
    });

    it('idempotencia: reenviar el mismo lote responde 200 y no duplica seguimientos ni recordatorio', async () => {
      const { professional, childId } = await setup();
      const nextCheckupDate = isoDateDaysFromNow(14);
      const b = batchBody(2, { nextCheckupDate });

      const first = await postFollowUpBatch(professional, childId, b);
      expect(first.status).toBe(201);

      const replay = await postFollowUpBatch(professional, childId, b);
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual(first.body);

      // Verificar en BD que no se duplicaron
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM follow_ups WHERE group_id = $1`,
        [replay.body[0].groupId],
      );
      expect(rows[0].n).toBe(2);

      const reminders = await remindersFor(b.items[0]!.id);
      expect(reminders).toHaveLength(1);
    });

    it('atomicidad: si un ítem falla o pertenece a otro niño no se guarda ninguno', async () => {
      const { caregiver, professional, childId } = await setup();
      const otherChild = await seedChild(caregiver.userId);
      await linkProfessional(otherChild, professional.userId);

      // Crear un seguimiento previo en otherChild
      const foreignId = crypto.randomUUID();
      await postFollowUp(professional, otherChild, {
        id: foreignId,
        type: 'observation',
        details: 'Previo en otro niño',
      });

      // Intentar crear un lote en childId que incluye foreignId
      const newId = crypto.randomUUID();
      const conflictBatch = {
        items: [
          { id: newId, type: 'intervention' as const, details: 'Nuevo intento' },
          { id: foreignId, type: 'referral' as const, details: 'ID que ya pertenece a otro niño' },
        ],
      };

      const res = await postFollowUpBatch(professional, childId, conflictBatch);
      expect(res.status).toBe(409);

      // Verificar que el nuevo ítem NO se guardó
      const checkNew = await admin.query(`SELECT id FROM follow_ups WHERE id = $1`, [newId]);
      expect(checkNew.rows).toHaveLength(0);

      // Si falla la validación de próximo control pasado, tampoco se guarda ningún ítem
      const pastBatch = batchBody(2, { nextCheckupDate: isoDateDaysFromNow(-1) });
      const pastRes = await postFollowUpBatch(professional, childId, pastBatch);
      expect(pastRes.status).toBe(400);
      const checkPast = await admin.query(`SELECT id FROM follow_ups WHERE id = ANY($1::uuid[])`, [
        pastBatch.items.map((item) => item.id),
      ]);
      expect(checkPast.rows).toHaveLength(0);
    });

    it('rechaza tipos repetidos, lote vacío o más de 3 ítems con 400', async () => {
      const { professional, childId } = await setup();

      const dupTypes = {
        items: [
          { id: crypto.randomUUID(), type: 'observation', details: 'Obs 1' },
          { id: crypto.randomUUID(), type: 'observation', details: 'Obs 2 repetida' },
        ],
      };
      expect((await postFollowUpBatch(professional, childId, dupTypes)).status).toBe(400);

      const empty = { items: [] };
      expect((await postFollowUpBatch(professional, childId, empty)).status).toBe(400);

      const over3 = batchBody(3);
      over3.items.push({
        id: crypto.randomUUID(),
        type: 'recommendation' as const,
        details: 'Cuarto ítem',
      });
      expect((await postFollowUpBatch(professional, childId, over3)).status).toBe(400);
    });

    it('rechaza con 403 para cuidador, enfermería, profesional sin vínculo y sin consentimiento', async () => {
      const { caregiver, childId } = await setup();
      const nurse = await createUser('PROFESSIONAL', 'nursing');
      await linkProfessional(childId, nurse.userId);
      const stranger = await createUser('PROFESSIONAL');

      const noConsentChild = await seedChild(caregiver.userId, false);
      const linkedProf = await createUser('PROFESSIONAL');
      await linkProfessional(noConsentChild, linkedProf.userId);

      const b = batchBody(2);
      expect((await postFollowUpBatch(caregiver, childId, b)).status).toBe(403);
      expect((await postFollowUpBatch(nurse, childId, b)).status).toBe(403);
      expect((await postFollowUpBatch(stranger, childId, b)).status).toBe(403);
      expect((await postFollowUpBatch(linkedProf, noConsentChild, b)).status).toBe(403);
    });

    it('creación individual sigue funcionando con groupId null', async () => {
      const { professional, childId } = await setup();
      const res = await postFollowUp(professional, childId, baseBody());
      expect(res.status).toBe(201);
      expect(res.body.groupId).toBeNull();
    });

    it('auditoría: registra un evento CREATE por cada fila creada en el lote', async () => {
      const { professional, childId } = await setup();
      const b = batchBody(2);
      const res = await postFollowUpBatch(professional, childId, b);
      expect(res.status).toBe(201);

      const ids = [b.items[0]!.id, b.items[1]!.id];
      let counts = 0;
      for (let i = 0; i < 20 && counts < 2; i += 1) {
        const { rows } = await admin.query(
          `SELECT count(*)::int AS n FROM audit_logs
            WHERE user_id = $1 AND action = 'CREATE' AND entity_type = 'follow_ups' AND entity_id = ANY($2::uuid[])`,
          [professional.userId, ids],
        );
        counts = rows[0].n as number;
        if (counts < 2) await new Promise((r) => setTimeout(r, 100));
      }
      expect(counts).toBe(2);

      // Reenviar el mismo lote (200) no duplica entradas de auditoría
      const replay = await postFollowUpBatch(professional, childId, b);
      expect(replay.status).toBe(200);
      const { rows: replayRows } = await admin.query(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE user_id = $1 AND action = 'CREATE' AND entity_type = 'follow_ups' AND entity_id = ANY($2::uuid[])`,
        [professional.userId, ids],
      );
      expect(replayRows[0].n).toBe(2);
    });
  });
});
