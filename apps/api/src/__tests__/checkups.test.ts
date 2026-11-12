import crypto from 'node:crypto';
import { CaregiverCheckupResponseSchema, CheckupResponseSchema } from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../services/token.service.js';

/**
 * Los controles son inmutables (trigger + REVOKE), por lo que estos tests no pueden limpiar lo que
 * crean: cada test usa usuarios y niños propios con UUID aleatorios y no borra nada al terminar.
 */
const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

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

describe('API de controles (/children/:childId/checkups, /checkups/:id/correction)', () => {
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

  async function createUser(
    role: 'CAREGIVER' | 'PROFESSIONAL',
  ): Promise<{ userId: string; token: string }> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', 'Test', 'User', 'active', now())`,
      [userId, `checkups-${userId}@nutrikids.local`],
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

  async function seedChild(caregiverId: string, ageMonths = 30): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, 'Mateo', 'Test', $2::date, 'MALE')`,
      [childId, isoDateMonthsAgo(ageMonths)],
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

  async function linkProfessional(childId: string, professionalId: string): Promise<void> {
    await admin.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 30)`,
      [crypto.randomUUID(), childId, professionalId],
    );
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    measuredAt: isoDaysAgo(2),
    weightKg: 12.5,
    lengthHeightCm: 90,
    position: 'STANDING',
    ...overrides,
  });

  async function setup() {
    const caregiver = await createUser('CAREGIVER');
    const childId = await seedChild(caregiver.userId);
    return { caregiver, childId };
  }

  describe('POST /children/:childId/checkups', () => {
    it('cuidador registra un control: origin y recordedById los fija el servidor, sin datos técnicos', async () => {
      const { caregiver, childId } = await setup();
      const payload = body();

      const res = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(payload);

      expect(res.status).toBe(201);
      expect(CaregiverCheckupResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        id: payload.id,
        childId,
        origin: 'CAREGIVER',
        recordedById: caregiver.userId,
        correctedCheckupId: null,
        isCurrent: true,
        weightKg: 12.5,
        lengthHeightCm: 90,
      });
      expect(res.body).not.toHaveProperty('results');
    });

    it('profesional vinculado registra un control con origen PROFESSIONAL y los 4 indicadores', async () => {
      const { childId } = await setup();
      const pro = await createUser('PROFESSIONAL');
      await linkProfessional(childId, pro.userId);

      const res = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', pro.token)
        .send(body());

      expect(res.status).toBe(201);
      expect(CheckupResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.origin).toBe('PROFESSIONAL');
      expect(res.body.recordedById).toBe(pro.userId);
      const indicators = (res.body.results as { indicator: string }[]).map((r) => r.indicator);
      expect(indicators.sort()).toEqual([
        'BMI_FOR_AGE',
        'LENGTH_HEIGHT_FOR_AGE',
        'WEIGHT_FOR_AGE',
        'WEIGHT_FOR_LENGTH_HEIGHT',
      ]);
    });

    it('reenviar el mismo id no duplica el control (200 con el existente)', async () => {
      const { caregiver, childId } = await setup();
      const payload = body();
      const send = () =>
        request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload);

      const first = await send();
      const second = await send();

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
      const { rows } = await admin.query(`SELECT count(*)::int AS n FROM checkups WHERE id = $1`, [
        payload.id,
      ]);
      expect(rows[0].n).toBe(1);
      const results = await admin.query(
        `SELECT count(*)::int AS n FROM indicator_results WHERE checkup_id = $1`,
        [payload.id],
      );
      expect(results.rows[0].n).toBe(4);
    });

    it('un id ya usado en otro niño responde 409', async () => {
      const { caregiver, childId } = await setup();
      const otherChild = await seedChild(caregiver.userId);
      const payload = body();

      await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(payload)
        .expect(201);
      const res = await request(app)
        .post(`/children/${otherChild}/checkups`)
        .set('Authorization', caregiver.token)
        .send(payload);

      expect(res.status).toBe(409);
    });

    it('valor atípico exige confirmOutlier; con la bandera se acepta', async () => {
      const { caregiver, childId } = await setup();
      const outlier = { weightKg: 35 };

      const rejected = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(body(outlier));
      expect(rejected.status).toBe(400);

      const accepted = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(body({ ...outlier, confirmOutlier: true }));
      expect(accepted.status).toBe(201);
    });

    it('rechaza valores fuera de los límites físicos, fechas futuras y niños fuera del rango OMS', async () => {
      const { caregiver, childId } = await setup();
      const post = (cid: string, payload: object) =>
        request(app)
          .post(`/children/${cid}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload);

      expect((await post(childId, body({ weightKg: 1 }))).status).toBe(400);
      expect(
        (await post(childId, body({ measuredAt: new Date(Date.now() + 86_400_000).toISOString() })))
          .status,
      ).toBe(400);

      const oldChild = await seedChild(caregiver.userId, 70);
      expect((await post(oldChild, body())).status).toBe(400);
    });

    it('sin consentimiento vigente responde 403', async () => {
      const { caregiver, childId } = await setup();
      await admin.query(`UPDATE consents SET revoked_at = now() WHERE child_id = $1`, [childId]);

      const res = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(body());

      expect(res.status).toBe(403);
    });

    it('un cuidador sin vínculo con el niño recibe 403', async () => {
      const { childId } = await setup();
      const stranger = await createUser('CAREGIVER');

      const res = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', stranger.token)
        .send(body());

      expect(res.status).toBe(403);
    });
  });

  describe('POST /checkups/:checkupId/correction', () => {
    it('crea un control nuevo que apunta al original y el original deja de ser vigente', async () => {
      const { caregiver, childId } = await setup();
      const original = body();
      await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(original)
        .expect(201);

      const fix = body({ weightKg: 13.1 });
      const res = await request(app)
        .post(`/checkups/${original.id}/correction`)
        .set('Authorization', caregiver.token)
        .send(fix);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: fix.id,
        childId,
        correctedCheckupId: original.id,
        isCurrent: true,
        weightKg: 13.1,
      });

      // El original queda intacto, con sus resultados.
      const row = await admin.query(`SELECT weight_kg FROM checkups WHERE id = $1`, [original.id]);
      expect(Number(row.rows[0].weight_kg)).toBe(12.5);
      const results = await admin.query(
        `SELECT count(*)::int AS n FROM indicator_results WHERE checkup_id = $1`,
        [original.id],
      );
      expect(results.rows[0].n).toBe(4);

      // La vista deriva solo el vigente.
      const current = await admin.query(`SELECT id FROM current_checkups WHERE child_id = $1`, [
        childId,
      ]);
      expect(current.rows.map((r) => r.id)).toEqual([fix.id]);
    });

    it('reenviar la misma corrección es idempotente y no se puede corregir dos veces el mismo control', async () => {
      const { caregiver, childId } = await setup();
      const original = body();
      await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(original)
        .expect(201);
      const fix = body({ weightKg: 13.1 });
      const send = (payload: object) =>
        request(app)
          .post(`/checkups/${original.id}/correction`)
          .set('Authorization', caregiver.token)
          .send(payload);

      expect((await send(fix)).status).toBe(201);
      expect((await send(fix)).status).toBe(200);
      expect((await send(body({ weightKg: 14 }))).status).toBe(409);
    });

    it('un control inexistente o de un niño ajeno responde 404', async () => {
      const { caregiver, childId } = await setup();
      const original = body();
      await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(original)
        .expect(201);
      const stranger = await createUser('CAREGIVER');

      const foreign = await request(app)
        .post(`/checkups/${original.id}/correction`)
        .set('Authorization', stranger.token)
        .send(body());
      const missing = await request(app)
        .post(`/checkups/${crypto.randomUUID()}/correction`)
        .set('Authorization', caregiver.token)
        .send(body());

      // Con el rol de aplicación RLS oculta el control (404); con la conexión owner de los tests
      // RLS no aplica y lo bloquea el vínculo (403). En ambos casos no se crea ni se revela nada.
      expect([403, 404]).toContain(foreign.status);
      expect(missing.status).toBe(404);
    });

    it('sin consentimiento vigente no se puede corregir (403)', async () => {
      const { caregiver, childId } = await setup();
      const original = body();
      await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(original)
        .expect(201);
      await admin.query(`UPDATE consents SET revoked_at = now() WHERE child_id = $1`, [childId]);

      const res = await request(app)
        .post(`/checkups/${original.id}/correction`)
        .set('Authorization', caregiver.token)
        .send(body());

      expect(res.status).toBe(403);
    });
  });

  describe('GET /children/:childId/checkups', () => {
    it('devuelve el historial completo ordenado por fecha (desc) con isCurrent', async () => {
      const { caregiver, childId } = await setup();
      const older = body({ measuredAt: isoDaysAgo(20), weightKg: 12.0 });
      const newer = body({ measuredAt: isoDaysAgo(3), weightKg: 12.8 });
      for (const payload of [newer, older]) {
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload)
          .expect(201);
      }
      const fix = body({ measuredAt: isoDaysAgo(20), weightKg: 12.2 });
      await request(app)
        .post(`/checkups/${older.id}/correction`)
        .set('Authorization', caregiver.token)
        .send(fix)
        .expect(201);

      const all = await request(app)
        .get(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token);
      const onlyCurrent = await request(app)
        .get(`/children/${childId}/checkups?onlyCurrent=true`)
        .set('Authorization', caregiver.token);

      expect(all.status).toBe(200);
      expect(all.body.map((c: { id: string }) => c.id)).toEqual([newer.id, fix.id, older.id]);
      expect(all.body.map((c: { isCurrent: boolean }) => c.isCurrent)).toEqual([true, true, false]);
      expect(all.body[0]).not.toHaveProperty('results');
      expect(onlyCurrent.body.map((c: { id: string }) => c.id)).toEqual([newer.id, fix.id]);
    });

    it('el profesional ve los resultados técnicos y el cuidador sin vínculo recibe 403', async () => {
      const { caregiver, childId } = await setup();
      await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send(body())
        .expect(201);
      const pro = await createUser('PROFESSIONAL');
      await linkProfessional(childId, pro.userId);
      const stranger = await createUser('CAREGIVER');

      const asPro = await request(app)
        .get(`/children/${childId}/checkups`)
        .set('Authorization', pro.token);
      const asStranger = await request(app)
        .get(`/children/${childId}/checkups`)
        .set('Authorization', stranger.token);

      expect(asPro.status).toBe(200);
      expect(asPro.body[0].results).toHaveLength(4);
      expect(asStranger.status).toBe(403);
    });
  });
});
