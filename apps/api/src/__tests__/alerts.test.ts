import crypto from 'node:crypto';
import {
  AlertDetailResponseSchema,
  AlertResponseSchema,
  type AlertResponse,
} from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  alertReason,
  compareAlerts,
  reviewDeadlineHours,
  riskFromClassification,
} from '../services/alerts.service.js';
import { signAccessToken } from '../services/token.service.js';

/**
 * Alertas automáticas y máquina de estados (NK-30, RF-11, RF-12, RF-17).
 * Los controles y `alert_history` son inmutables: cada test usa usuarios y niños propios.
 *
 * Medidas de referencia (niño de 30 meses, 90 cm de pie):
 * - 12.5 kg → todo normal (sin alertas)
 * - 9 kg    → P/T z ≈ −4.8 (SEVERE_WASTING) y P/E z ≈ −3.2 (SEVERE_UNDERWEIGHT)
 * - 10.5 kg → P/T z ≈ −2.6 (WASTING)
 * - 17 kg   → P/T > +2 (OVERWEIGHT) e IMC/E > +3 (OBESITY)
 */

describe('riskFromClassification / compareAlerts (unidad)', () => {
  it('mapea clasificaciones a riesgo y gravedad', () => {
    expect(riskFromClassification('SEVERE_WASTING')).toEqual({
      riskType: 'WASTING',
      isSevere: true,
    });
    expect(riskFromClassification('WASTING')).toEqual({ riskType: 'WASTING', isSevere: false });
    expect(riskFromClassification('SEVERE_STUNTING')).toEqual({
      riskType: 'STUNTING',
      isSevere: true,
    });
    expect(riskFromClassification('SEVERE_UNDERWEIGHT')).toEqual({
      riskType: 'UNDERWEIGHT',
      isSevere: true,
    });
    expect(riskFromClassification('OBESITY')).toEqual({ riskType: 'OBESITY', isSevere: false });
    expect(riskFromClassification('OVERWEIGHT')).toEqual({
      riskType: 'OVERWEIGHT',
      isSevere: false,
    });
    expect(riskFromClassification('OVERWEIGHT_RISK')).toBeNull();
    expect(riskFromClassification('NORMAL')).toBeNull();
  });

  it('el motivo indica indicador, valor y clasificación', () => {
    expect(alertReason('WEIGHT_FOR_LENGTH_HEIGHT', 'SEVERE_WASTING', -3.4)).toBe(
      'Desnutrición aguda severa: P/T z = -3.40',
    );
  });

  it('ordena por gravedad, tipo de riesgo y antigüedad', () => {
    const a = (riskType: AlertResponse['riskType'], isSevere: boolean, createdAt: string) => ({
      riskType,
      isSevere,
      createdAt,
    });
    const list = [
      a('OVERWEIGHT', false, '2026-01-01T00:00:00Z'),
      a('WASTING', false, '2026-01-03T00:00:00Z'),
      a('UNDERWEIGHT', true, '2026-01-01T00:00:00Z'),
      a('WASTING', true, '2026-01-05T00:00:00Z'),
      a('WASTING', false, '2026-01-02T00:00:00Z'),
    ].sort(compareAlerts);
    expect(list).toEqual([
      a('WASTING', true, '2026-01-05T00:00:00Z'),
      a('UNDERWEIGHT', true, '2026-01-01T00:00:00Z'),
      a('WASTING', false, '2026-01-02T00:00:00Z'),
      a('WASTING', false, '2026-01-03T00:00:00Z'),
      a('OVERWEIGHT', false, '2026-01-01T00:00:00Z'),
    ]);
  });

  it('el plazo de revisión sale de la configuración', () => {
    expect(reviewDeadlineHours(false)).toBe(env.ALERT_REVIEW_DEADLINE_HOURS);
    expect(reviewDeadlineHours(true)).toBe(env.ALERT_REVIEW_DEADLINE_SEVERE_HOURS);
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

describe('Alerts API (/alerts)', { timeout: 60000 }, () => {
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

  async function createUser(role: 'CAREGIVER' | 'PROFESSIONAL'): Promise<TestUser> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', 'Test', 'User', 'active', now())`,
      [userId, `alerts-${userId}@nutrikids.local`],
    );
    if (role === 'CAREGIVER') {
      await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+593990000')`, [
        userId,
      ]);
    } else {
      await admin.query(
        `INSERT INTO professionals (user_id, specialty, license_number) VALUES ($1, 'pediatrics', $2)`,
        [userId, `LIC-${userId.slice(0, 8)}`],
      );
    }
    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: [role],
      specialty: role === 'PROFESSIONAL' ? 'pediatrics' : null,
    });
    return { userId, token: `Bearer ${accessToken}` };
  }

  async function seedChild(caregiverId: string): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, 'Mateo', 'Test', $2::date, 'MALE')`,
      [childId, isoDateMonthsAgo(30)],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', true)`,
      [caregiverId, childId],
    );
    await admin.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, caregiverId],
    );
    return childId;
  }

  async function linkProfessional(childId: string, professionalId: string, ended = false) {
    await admin.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 30, CASE WHEN $4::boolean THEN CURRENT_DATE - 1 END)`,
      [crypto.randomUUID(), childId, professionalId, ended],
    );
  }

  async function postCheckup(user: TestUser, childId: string, weightKg: number) {
    const res = await request(app)
      .post(`/children/${childId}/checkups`)
      .set('Authorization', user.token)
      .send({
        id: crypto.randomUUID(),
        measuredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        weightKg,
        lengthHeightCm: 90,
        position: 'STANDING',
      });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  async function setup(options: { linked?: boolean } = {}) {
    const caregiver = await createUser('CAREGIVER');
    const professional = await createUser('PROFESSIONAL');
    const childId = await seedChild(caregiver.userId);
    if (options.linked !== false) {
      await linkProfessional(childId, professional.userId);
    }
    return { caregiver, professional, childId };
  }

  async function listFor(user: TestUser, query = '') {
    return request(app).get(`/alerts${query}`).set('Authorization', user.token);
  }

  const patchStatus = (user: TestUser, alertId: string, status: string) =>
    request(app)
      .patch(`/alerts/${alertId}/status`)
      .set('Authorization', user.token)
      .send({ status });

  async function historyCount(alertId: string): Promise<number> {
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM alert_history WHERE alert_id = $1`,
      [alertId],
    );
    return rows[0].n as number;
  }

  async function insertFollowUp(childId: string, alertId: string, professionalId: string) {
    await admin.query(
      `INSERT INTO follow_ups (id, child_id, alert_id, professional_id, type, details)
       VALUES ($1, $2, $3, $4, 'observation', 'Control en 2 semanas')`,
      [crypto.randomUUID(), childId, alertId, professionalId],
    );
  }

  /** Alertas del niño leídas directamente de la BD (sin entregarlas a ningún profesional). */
  async function dbAlerts(childId: string) {
    const { rows } = await admin.query(
      `SELECT a.id, a.status, ir.indicator FROM alerts a
         JOIN indicator_results ir ON ir.id = a.indicator_result_id
         JOIN checkups c ON c.id = ir.checkup_id
        WHERE c.child_id = $1`,
      [childId],
    );
    return rows as { id: string; status: string; indicator: string }[];
  }

  /** Alerta P/T grave aún en GENERATED (ningún profesional la recibió todavía). */
  async function undeliveredWastingAlertId(
    caregiver: TestUser,
    childId: string,
    professionalId?: string,
  ): Promise<string> {
    await postCheckup(caregiver, childId, 9);
    const alert = (await dbAlerts(childId)).find((a) => a.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT');
    expect(alert?.status).toBe('GENERATED');
    if (professionalId) {
      await linkProfessional(childId, professionalId);
    }
    return alert!.id;
  }

  /** Alerta P/T grave ya entregada en la bandeja (PENDING_REVIEW). */
  async function severeWastingAlert(user: TestUser, childId: string): Promise<AlertResponse> {
    await postCheckup(user, childId, 9);
    const res = await listFor(user, `?childId=${childId}`);
    const alert = (res.body as AlertResponse[]).find(
      (a) => a.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT',
    );
    expect(alert?.status).toBe('PENDING_REVIEW');
    return alert!;
  }

  describe('generación automática', () => {
    it('un control con P/T < −3 genera alertas graves con indicador, valor y motivo', async () => {
      const { caregiver, professional, childId } = await setup();
      const checkup = await postCheckup(caregiver, childId, 9);

      // Con un profesional vinculado nacen notificadas (NK-36).
      expect((await dbAlerts(childId)).map((a) => a.status)).toEqual([
        'PENDING_REVIEW',
        'PENDING_REVIEW',
      ]);

      const res = await listFor(professional, `?childId=${childId}`);
      expect(res.status).toBe(200);
      const alerts = res.body as AlertResponse[];
      for (const a of alerts) expect(AlertResponseSchema.safeParse(a).success).toBe(true);

      expect(alerts.map((a) => [a.indicator, a.riskType, a.isSevere])).toEqual([
        ['WEIGHT_FOR_LENGTH_HEIGHT', 'WASTING', true],
        ['WEIGHT_FOR_AGE', 'UNDERWEIGHT', true],
      ]);
      const wasting = alerts[0]!;
      expect(wasting).toMatchObject({
        childId,
        checkupId: checkup.id,
        classification: 'SEVERE_WASTING',
        status: 'PENDING_REVIEW',
        isOverdue: false,
        checkupIsCurrent: true,
      });
      expect(wasting.zScore).toBeLessThan(-3);
      expect(wasting.reason).toMatch(/^Desnutrición aguda severa: P\/T z = -\d+\.\d{2}$/);
      expect(Date.parse(wasting.reviewDueAt) - Date.parse(wasting.createdAt)).toBe(
        env.ALERT_REVIEW_DEADLINE_SEVERE_HOURS * 3_600_000,
      );

      const detail = await request(app)
        .get(`/alerts/${wasting.id}`)
        .set('Authorization', professional.token);
      expect(detail.status).toBe(200);
      expect(AlertDetailResponseSchema.safeParse(detail.body).success).toBe(true);
      expect(detail.body.history).toEqual([
        { status: 'GENERATED', changedById: caregiver.userId, changedAt: expect.any(String) },
        {
          status: 'PENDING_REVIEW',
          changedById: professional.userId,
          changedAt: expect.any(String),
        },
      ]);
    });

    it('un control normal no genera alertas y un reenvío idempotente no las duplica', async () => {
      const { caregiver, professional, childId } = await setup();
      await postCheckup(caregiver, childId, 12.5);
      expect((await listFor(professional, `?childId=${childId}`)).body).toEqual([]);

      const payload = {
        id: crypto.randomUUID(),
        measuredAt: new Date(Date.now() - 86_400_000).toISOString(),
        weightKg: 9,
        lengthHeightCm: 90,
        position: 'STANDING',
      };
      const first = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(payload);
      const replay = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(payload);
      expect([first.status, replay.status]).toEqual([201, 200]);
      expect((await listFor(professional, `?childId=${childId}`)).body).toHaveLength(2);
    });

    it('al corregir un control, sus alertas no se cierran solas', async () => {
      const { professional, childId } = await setup();
      const original = await postCheckup(professional, childId, 9);
      const correction = await request(app)
        .post(`/checkups/${original.id}/correction`)
        .set('Authorization', professional.token)
        .send({
          id: crypto.randomUUID(),
          measuredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          weightKg: 12.5,
          lengthHeightCm: 90,
          position: 'STANDING',
        });
      expect(correction.status).toBe(201);

      const alerts = (await listFor(professional, `?childId=${childId}`)).body as AlertResponse[];
      expect(alerts).toHaveLength(2);
      for (const a of alerts) {
        expect(a.status).toBe('PENDING_REVIEW');
        expect(a.checkupIsCurrent).toBe(false);
      }
    });
  });

  describe('máquina de estados (Figura 3)', () => {
    it('recorre los cuatro estados y registra cada cambio con usuario y hora', async () => {
      const { caregiver, professional, childId } = await setup({ linked: false });
      const alertId = await undeliveredWastingAlertId(caregiver, childId, professional.userId);

      // El sistema notifica al profesional al entregársela: GENERATED → PENDING_REVIEW.
      const opened = await request(app)
        .get(`/alerts/${alertId}`)
        .set('Authorization', professional.token);
      expect(opened.body.status).toBe('PENDING_REVIEW');

      const reviewed = await patchStatus(professional, alertId, 'REVIEWED');
      expect(reviewed.status).toBe(200);
      expect(reviewed.body.status).toBe('REVIEWED');

      // Sin seguimiento registrado no se puede establecer.
      const blocked = await patchStatus(professional, alertId, 'FOLLOW_UP_ESTABLISHED');
      expect(blocked.status).toBe(409);
      expect(await historyCount(alertId)).toBe(3);

      await insertFollowUp(childId, alertId, professional.userId);
      const done = await patchStatus(professional, alertId, 'FOLLOW_UP_ESTABLISHED');
      expect(done.status).toBe(200);
      expect(AlertDetailResponseSchema.safeParse(done.body).success).toBe(true);

      const history = done.body.history as {
        status: string;
        changedById: string;
        changedAt: string;
      }[];
      expect(history.map((h) => [h.status, h.changedById])).toEqual([
        ['GENERATED', caregiver.userId],
        ['PENDING_REVIEW', professional.userId],
        ['REVIEWED', professional.userId],
        ['FOLLOW_UP_ESTABLISHED', professional.userId],
      ]);
      for (const h of history) expect(Number.isNaN(Date.parse(h.changedAt))).toBe(false);
    });

    it.each(['GENERATED', 'PENDING_REVIEW', 'REVIEWED', 'FOLLOW_UP_ESTABLISHED'])(
      'desde GENERATED rechaza el PATCH a %s (409, sin historial)',
      async (to) => {
        const { caregiver, professional, childId } = await setup({ linked: false });
        const alertId = await undeliveredWastingAlertId(caregiver, childId, professional.userId);
        await insertFollowUp(childId, alertId, professional.userId);

        const res = await patchStatus(professional, alertId, to);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/Transición de estado inválida/);
        expect(await historyCount(alertId)).toBe(1);
      },
    );

    it('el paso a PENDING_REVIEW lo hace el sistema, no el profesional', async () => {
      const { caregiver, professional, childId } = await setup({ linked: false });
      const alertId = await undeliveredWastingAlertId(caregiver, childId, professional.userId);
      const res = await patchStatus(professional, alertId, 'PENDING_REVIEW');
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/la realiza el sistema/);
    });

    it('rechaza saltos, retrocesos y salidas del estado final', async () => {
      const { professional, childId } = await setup();
      const alert = await severeWastingAlert(professional, childId);
      await insertFollowUp(childId, alert.id, professional.userId);

      for (const to of ['GENERATED', 'PENDING_REVIEW', 'FOLLOW_UP_ESTABLISHED']) {
        expect((await patchStatus(professional, alert.id, to)).status).toBe(409);
      }
      expect((await patchStatus(professional, alert.id, 'REVIEWED')).status).toBe(200);
      for (const to of ['GENERATED', 'PENDING_REVIEW', 'REVIEWED']) {
        expect((await patchStatus(professional, alert.id, to)).status).toBe(409);
      }
      expect((await patchStatus(professional, alert.id, 'FOLLOW_UP_ESTABLISHED')).status).toBe(200);
      for (const to of ['GENERATED', 'PENDING_REVIEW', 'REVIEWED', 'FOLLOW_UP_ESTABLISHED']) {
        expect((await patchStatus(professional, alert.id, to)).status).toBe(409);
      }
      expect(await historyCount(alert.id)).toBe(4);
    });

    it('rechaza estados desconocidos con 400', async () => {
      const { professional, childId } = await setup();
      const alert = await severeWastingAlert(professional, childId);
      expect((await patchStatus(professional, alert.id, 'CLOSED')).status).toBe(400);
    });
  });

  describe('permisos', () => {
    it('solo los profesionales vinculados al niño cambian el estado', async () => {
      const { caregiver, professional, childId } = await setup();
      const alert = await severeWastingAlert(professional, childId);

      const stranger = await createUser('PROFESSIONAL');
      expect([403, 404]).toContain((await patchStatus(stranger, alert.id, 'REVIEWED')).status);

      const former = await createUser('PROFESSIONAL');
      await linkProfessional(childId, former.userId, true);
      expect([403, 404]).toContain((await patchStatus(former, alert.id, 'REVIEWED')).status);

      expect((await patchStatus(caregiver, alert.id, 'REVIEWED')).status).toBe(403);
      expect((await listFor(caregiver)).status).toBe(403);
      expect(await historyCount(alert.id)).toBe(2);
    });

    it('la bandeja de un profesional no vinculado no muestra ni notifica la alerta', async () => {
      const { caregiver, childId } = await setup({ linked: false });
      const alertId = await undeliveredWastingAlertId(caregiver, childId);
      const stranger = await createUser('PROFESSIONAL');
      expect((await listFor(stranger, `?childId=${childId}`)).body).toEqual([]);
      expect((await dbAlerts(childId)).find((a) => a.id === alertId)?.status).toBe('GENERATED');
    });
  });

  describe('GET /alerts (bandeja)', () => {
    it('ordena por riesgo y antigüedad, filtra por estado y marca las vencidas', async () => {
      const { professional, childId } = await setup();
      await postCheckup(professional, childId, 10.5); // WASTING moderada
      await postCheckup(professional, childId, 17); // OVERWEIGHT + OBESITY
      await postCheckup(professional, childId, 9); // WASTING y UNDERWEIGHT graves

      const all = (await listFor(professional, `?childId=${childId}`)).body as AlertResponse[];
      expect(all.map((a) => [a.riskType, a.isSevere])).toEqual([
        ['WASTING', true],
        ['UNDERWEIGHT', true],
        ['WASTING', false],
        ['OBESITY', false],
        ['OVERWEIGHT', false],
      ]);
      expect(all.every((a) => a.status === 'PENDING_REVIEW')).toBe(true);

      // Vencida: la alerta moderada creada hace más que el plazo configurado.
      const moderate = all[2]!;
      await admin.query(
        `UPDATE alerts SET created_at = now() - make_interval(hours => $2) WHERE id = $1`,
        [moderate.id, env.ALERT_REVIEW_DEADLINE_HOURS + 1],
      );
      const overdue = (await listFor(professional, `?childId=${childId}`)).body as AlertResponse[];
      expect(overdue.filter((a) => a.isOverdue).map((a) => a.id)).toEqual([moderate.id]);
      // Vencida no significa cerrada: sigue pendiente.
      expect(overdue.find((a) => a.id === moderate.id)?.status).toBe('PENDING_REVIEW');

      expect((await patchStatus(professional, moderate.id, 'REVIEWED')).status).toBe(200);
      const reviewed = (await listFor(professional, `?childId=${childId}&status=REVIEWED`))
        .body as AlertResponse[];
      expect(reviewed.map((a) => a.id)).toEqual([moderate.id]);
      expect(reviewed[0]!.isOverdue).toBe(false);

      const open = (
        await listFor(professional, `?childId=${childId}&status=GENERATED,PENDING_REVIEW`)
      ).body as AlertResponse[];
      expect(open).toHaveLength(4);

      expect((await listFor(professional, '?status=CLOSED')).status).toBe(400);
    });
  });
});
