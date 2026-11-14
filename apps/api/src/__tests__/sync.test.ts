import crypto from 'node:crypto';
import {
  CaregiverCheckupResponseSchema,
  CheckupResponseSchema,
  SyncCheckupsResponseSchema,
} from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { encryptPii } from '../lib/pii-crypto.js';
import { computeIndicatorResults } from '../services/checkups.service.js';
import { signAccessToken } from '../services/token.service.js';

/**
 * Los controles y la auditoría son inmutables, por lo que estos tests no limpian lo que crean:
 * cada test usa usuarios y niños propios con UUID aleatorios.
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

describe('Sync API (POST /sync/checkups)', { timeout: 60000 }, () => {
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
       VALUES ($1, $2, 'hash', $3, $4, 'active', now())`,
      [
        userId,
        `sync-${userId}@nutrikids.local`,
        encryptPii('Test', 'users:first_name'),
        encryptPii('User', 'users:last_name'),
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
    return { userId, token: `Bearer ${accessToken}` };
  }

  async function seedChild(caregiverId: string, birthDate = isoDateMonthsAgo(30)): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, $4::date, 'MALE')`,
      [
        childId,
        encryptPii('Mateo', 'children:first_name'),
        encryptPii('Test', 'children:last_name'),
        birthDate,
      ],
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

  const item = (childId: string, overrides: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    childId,
    measuredAt: isoDaysAgo(2),
    weightKg: 12.5,
    lengthHeightCm: 90,
    position: 'STANDING',
    ...overrides,
  });

  async function countCheckups(ids: string[]): Promise<number> {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM checkups WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return Number(rows[0]!.n);
  }

  /** La auditoría se escribe sin bloquear la respuesta: espera brevemente a que aparezca. */
  async function waitForAudit(
    sql: string,
    params: unknown[],
    expected: number,
  ): Promise<Record<string, unknown>[]> {
    let rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 30; i++) {
      rows = (await admin.query(sql, params)).rows;
      if (rows.length >= expected) return rows;
      await new Promise((r) => setTimeout(r, 200));
    }
    return rows;
  }

  it('crea el lote y reenviarlo no duplica nada', async () => {
    const caregiver = await createUser('CAREGIVER');
    const childId = await seedChild(caregiver.userId);
    const batch = [
      item(childId, { measuredAt: isoDaysAgo(20) }),
      item(childId, { measuredAt: isoDaysAgo(10), weightKg: 12.8 }),
      item(childId, { measuredAt: isoDaysAgo(1), weightKg: 13 }),
    ];

    const first = await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: batch });

    expect(first.status).toBe(200);
    expect(SyncCheckupsResponseSchema.safeParse(first.body).success).toBe(true);
    expect(first.body.results.map((r: { status: string }) => r.status)).toEqual([
      'CREATED',
      'CREATED',
      'CREATED',
    ]);
    expect(first.body.results.map((r: { id: string }) => r.id)).toEqual(batch.map((b) => b.id));

    const second = await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: batch });

    expect(second.status).toBe(200);
    expect(second.body.results.map((r: { status: string }) => r.status)).toEqual([
      'DUPLICATE',
      'DUPLICATE',
      'DUPLICATE',
    ]);
    expect(await countCheckups(batch.map((b) => b.id))).toBe(3);
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM indicator_results WHERE checkup_id = ANY($1::uuid[])`,
      [batch.map((b) => b.id)],
    );
    expect(Number(rows[0]!.n)).toBe(12);

    const creates = await waitForAudit(
      `SELECT * FROM audit_logs WHERE action = 'CREATE' AND entity_type = 'checkups'
       AND entity_id = ANY($1::uuid[])`,
      [batch.map((b) => b.id)],
      3,
    );
    expect(creates).toHaveLength(3);
  });

  it('un control con error no hace perder el resto del lote', async () => {
    const caregiver = await createUser('CAREGIVER');
    const childId = await seedChild(caregiver.userId);
    const stranger = await createUser('CAREGIVER');
    const foreignChildId = await seedChild(stranger.userId);

    const ok1 = item(childId, { measuredAt: isoDaysAgo(5) });
    const unlinked = item(foreignChildId);
    const invalid = item(childId, { weightKg: 1 });
    const future = item(childId, { measuredAt: new Date(Date.now() + 86_400_000).toISOString() });
    const ok2 = item(childId, { measuredAt: isoDaysAgo(3) });

    const res = await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: [ok1, unlinked, invalid, future, ok2, 'basura'] });

    expect(res.status).toBe(200);
    const results = res.body.results as {
      id: string | null;
      status: string;
      error?: { status: number };
    }[];
    expect(results.map((r) => r.status)).toEqual([
      'CREATED',
      'ERROR',
      'ERROR',
      'ERROR',
      'CREATED',
      'ERROR',
    ]);
    expect(results[1]!.error?.status).toBe(403);
    expect(results[2]!.error?.status).toBe(400);
    expect(results[2]!.id).toBe(invalid.id);
    expect(results[3]!.error?.status).toBe(400);
    expect(results[5]!.id).toBeNull();
    expect(await countCheckups([ok1.id, ok2.id])).toBe(2);
    expect(await countCheckups([unlinked.id, invalid.id, future.id])).toBe(0);
  });

  it('un id ya usado para otro niño se reporta como conflicto', async () => {
    const caregiver = await createUser('CAREGIVER');
    const childA = await seedChild(caregiver.userId);
    const childB = await seedChild(caregiver.userId);
    const original = item(childA);

    await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: [original] });
    const res = await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: [{ ...original, childId: childB }] });

    expect(res.body.results[0]).toMatchObject({ status: 'ERROR', error: { status: 409 } });
  });

  it('devuelve los resultados recalculados según el perfil (RF-14)', async () => {
    const caregiver = await createUser('CAREGIVER');
    const professional = await createUser('PROFESSIONAL');
    const childId = await seedChild(caregiver.userId);
    await linkProfessional(childId, professional.userId);

    const prof = await request(app)
      .post('/sync/checkups')
      .set('Authorization', professional.token)
      .send({ checkups: [item(childId)] });
    const care = await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: [item(childId)] });

    const profCheckup = prof.body.results[0].checkup;
    expect(CheckupResponseSchema.safeParse(profCheckup).success).toBe(true);
    expect(profCheckup.origin).toBe('PROFESSIONAL');
    expect(profCheckup.results).toHaveLength(4);

    const careCheckup = care.body.results[0].checkup;
    expect(CaregiverCheckupResponseSchema.safeParse(careCheckup).success).toBe(true);
    expect(careCheckup.origin).toBe('CAREGIVER');
    expect(careCheckup).not.toHaveProperty('results');
  });

  it('conserva el cálculo del servidor y audita la discrepancia con el del celular', async () => {
    const caregiver = await createUser('CAREGIVER');
    const professional = await createUser('PROFESSIONAL');
    const birthDate = isoDateMonthsAgo(30);
    const childId = await seedChild(caregiver.userId, birthDate);
    await linkProfessional(childId, professional.userId);

    const measuredAt = isoDaysAgo(2);
    const expected = computeIndicatorResults({
      sex: 'MALE',
      birthDate: new Date(`${birthDate}T00:00:00.000Z`),
      measuredAt: new Date(measuredAt),
      weightKg: 12.5,
      lengthHeightCm: 90,
      position: 'STANDING',
    });
    const correctResults = expected.map(({ indicator, zScore, percentile, classification }) => ({
      indicator,
      zScore,
      percentile,
      classification,
    }));
    const wfa = expected.find((r) => r.indicator === 'WEIGHT_FOR_AGE')!;
    const wrongResults = correctResults.map((r) =>
      r.indicator === 'WEIGHT_FOR_AGE'
        ? { ...r, zScore: wfa.zScore + 1.5, classification: 'SEVERE_UNDERWEIGHT' }
        : r,
    );

    const wrong = item(childId, { measuredAt, results: wrongResults });
    const right = item(childId, { measuredAt, results: correctResults });

    const res = await request(app)
      .post('/sync/checkups')
      .set('Authorization', professional.token)
      .send({ checkups: [wrong, right] });

    expect(res.status).toBe(200);
    const [wrongResult, rightResult] = res.body.results;
    expect(wrongResult.status).toBe('CREATED');
    expect(wrongResult.discrepancies).toEqual([
      { indicator: 'WEIGHT_FOR_AGE', fields: ['zScore', 'classification'] },
    ]);
    const serverWfa = wrongResult.checkup.results.find(
      (r: { indicator: string }) => r.indicator === 'WEIGHT_FOR_AGE',
    );
    expect(serverWfa.zScore).toBe(wfa.zScore);
    expect(serverWfa.classification).toBe(wfa.classification);

    expect(rightResult.status).toBe('CREATED');
    expect(rightResult).not.toHaveProperty('discrepancies');

    const audits = await waitForAudit(
      `SELECT * FROM audit_logs WHERE action = 'DISCREPANCY' AND details->>'checkupId' = ANY($1::text[])`,
      [[wrong.id, right.id]],
      1,
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      user_id: professional.userId,
      entity_type: 'indicator_results',
      entity_id: serverWfa.id,
    });
    expect(audits[0]!.details).toMatchObject({
      checkupId: wrong.id,
      indicator: 'WEIGHT_FOR_AGE',
      client: { zScore: wfa.zScore + 1.5, classification: 'SEVERE_UNDERWEIGHT' },
      server: { zScore: wfa.zScore, classification: wfa.classification },
    });

    // Reenviar el mismo lote no vuelve a auditar la discrepancia.
    const resend = await request(app)
      .post('/sync/checkups')
      .set('Authorization', professional.token)
      .send({ checkups: [wrong, right] });
    expect(resend.body.results[0]).not.toHaveProperty('discrepancies');
    await new Promise((r) => setTimeout(r, 500));
    const { rows } = await admin.query(
      `SELECT 1 FROM audit_logs WHERE action = 'DISCREPANCY' AND details->>'checkupId' = $1`,
      [wrong.id],
    );
    expect(rows).toHaveLength(1);
  });

  it('valida el lote y exige autenticación y permiso', async () => {
    const caregiver = await createUser('CAREGIVER');

    const empty = await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: [] });
    expect(empty.status).toBe(400);

    const tooMany = await request(app)
      .post('/sync/checkups')
      .set('Authorization', caregiver.token)
      .send({ checkups: Array.from({ length: 101 }, () => ({})) });
    expect(tooMany.status).toBe(400);

    const noAuth = await request(app)
      .post('/sync/checkups')
      .send({ checkups: [{}] });
    expect(noAuth.status).toBe(401);
  });
});
