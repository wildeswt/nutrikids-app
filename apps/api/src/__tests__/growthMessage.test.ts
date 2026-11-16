import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { encryptPii } from '../lib/pii-crypto.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../services/token.service.js';

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

/** Mensaje de crecimiento para el cuidador (NK-35, RF-14). Datos sintéticos. */
describe('GET /children/:childId/growth-message (NK-35)', { timeout: 60000 }, () => {
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
    auth: string;
  }

  async function createUser(role: 'CAREGIVER' | 'PROFESSIONAL'): Promise<TestUser> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', $3, $4, 'active', now())`,
      [
        userId,
        `growth-${userId}@nutrikids.local`,
        encryptPii('Ana', 'users:first_name'),
        encryptPii('Prueba', 'users:last_name'),
      ],
    );
    if (role === 'CAREGIVER') {
      await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, $2)`, [
        userId,
        encryptPii('+593990000', 'caregivers:phone'),
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
    return { userId, auth: `Bearer ${accessToken}` };
  }

  async function seedChild(caregiver: TestUser): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, CURRENT_DATE - 900, 'MALE')`,
      [
        childId,
        encryptPii('Mateo', 'children:first_name'),
        encryptPii('Sintetico', 'children:last_name'),
      ],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', true)`,
      [caregiver.userId, childId],
    );
    await admin.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, caregiver.userId],
    );
    return childId;
  }

  /** Control con un resultado y una alerta en el estado indicado. */
  async function seedAlert(
    childId: string,
    recordedById: string,
    risk: string,
    status: string,
  ): Promise<string> {
    const checkupId = crypto.randomUUID();
    const resultId = crypto.randomUUID();
    const alertId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO checkups (id, child_id, measured_at, weight_kg, length_height_cm, position, origin, recorded_by_id)
       VALUES ($1, $2, now(), 9.0, 85.0, 'STANDING', 'CAREGIVER', $3)`,
      [checkupId, childId, recordedById],
    );
    await admin.query(
      `INSERT INTO indicator_results (id, checkup_id, indicator, z_score, percentile, classification, reference_version)
       VALUES ($1, $2, 'WEIGHT_FOR_AGE', -2.4, 0.8, 'UNDERWEIGHT', 'WHO 2006')`,
      [resultId, checkupId],
    );
    await admin.query(
      `INSERT INTO alerts (id, indicator_result_id, risk_type, is_severe, status)
       VALUES ($1, $2, $3, false, $4)`,
      [alertId, resultId, risk, status],
    );
    await admin.query(
      `INSERT INTO alert_history (id, alert_id, status, changed_by_id, changed_at)
       VALUES ($1, $2, $3, $4, now())`,
      [crypto.randomUUID(), alertId, status, recordedById],
    );
    return alertId;
  }

  const get = (childId: string, user?: TestUser) => {
    const req = request(app).get(`/children/${childId}/growth-message`);
    return user ? req.set('Authorization', user.auth) : req;
  };

  it('sin alertas responde ok y sin datos', async () => {
    const caregiver = await createUser('CAREGIVER');
    const childId = await seedChild(caregiver);

    const res = await get(childId, caregiver);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      childId,
      status: 'ok',
      concern: null,
      recommendation: null,
      nextCheckupDate: null,
      reviewedAt: null,
    });
  });

  it('mientras la alerta no esté revisada el cuidador sigue viendo ok, sin pistas de la alerta', async () => {
    const caregiver = await createUser('CAREGIVER');
    const childId = await seedChild(caregiver);
    await seedAlert(childId, caregiver.userId, 'UNDERWEIGHT', 'GENERATED');

    for (const status of ['GENERATED', 'PENDING_REVIEW']) {
      await admin.query(
        `UPDATE alerts SET status = $2 WHERE id IN (
        SELECT a.id FROM alerts a JOIN indicator_results ir ON ir.id = a.indicator_result_id
        JOIN checkups c ON c.id = ir.checkup_id WHERE c.child_id = $1)`,
        [childId, status],
      );
      const res = await get(childId, caregiver);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.concern).toBeNull();
      expect(res.body.nextCheckupDate).toBeNull();
    }
  });

  it('tras la revisión aparece la orientación y el próximo control, sin valores técnicos', async () => {
    const caregiver = await createUser('CAREGIVER');
    const professional = await createUser('PROFESSIONAL');
    const childId = await seedChild(caregiver);
    await admin.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 30)`,
      [crypto.randomUUID(), childId, professional.userId],
    );
    const alertId = await seedAlert(childId, caregiver.userId, 'UNDERWEIGHT', 'REVIEWED');
    await admin.query(
      `INSERT INTO follow_ups (id, child_id, alert_id, professional_id, type, details, next_checkup_date)
       VALUES ($1, $2, $3, $4, 'recommendation', 'Ofrecer cinco comidas al día', CURRENT_DATE + 14)`,
      [crypto.randomUUID(), childId, alertId, professional.userId],
    );

    const res = await get(childId, caregiver);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      childId,
      status: 'reviewed',
      concern: 'below',
      recommendation: 'Ofrecer cinco comidas al día',
    });
    expect(res.body.nextCheckupDate).toBe(
      new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
    );
    expect(res.body.reviewedAt).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(
      /zScore|z_score|percentile|classification|riskType|UNDERWEIGHT|WEIGHT_FOR_AGE|isSevere/,
    );
  });

  it('el exceso de peso se comunica como por encima de lo esperado', async () => {
    const caregiver = await createUser('CAREGIVER');
    const childId = await seedChild(caregiver);
    await seedAlert(childId, caregiver.userId, 'OBESITY', 'REVIEWED');

    const res = await get(childId, caregiver);
    expect(res.body).toMatchObject({ status: 'reviewed', concern: 'above', recommendation: null });
  });

  it('exige sesión y vínculo con el niño (401/403)', async () => {
    const caregiver = await createUser('CAREGIVER');
    const stranger = await createUser('CAREGIVER');
    const childId = await seedChild(caregiver);

    expect((await get(childId)).status).toBe(401);
    expect((await get(childId, stranger)).status).toBe(403);
    expect((await get('no-es-uuid', caregiver)).status).toBe(400);
  });
});
