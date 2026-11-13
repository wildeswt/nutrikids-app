import crypto from 'node:crypto';
import {
  CaregiverIndicatorResultSchema,
  CheckupResponseSchema,
  IndicatorResultSchema,
} from '@nutrikids/shared';
import { DEFAULT_CUTOFFS, WHO_REFERENCE_VERSION } from '@nutrikids/who-growth';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MATEO, MATEO_CONTROLS, buildMateoCheckups } from '../lib/seedDev.js';
import { computeIndicatorResults } from '../services/checkups.service.js';
import { signAccessToken } from '../services/token.service.js';

/**
 * End-to-end test of server-side indicator calculation (RF-07, RF-08) with Mateo's data
 * (born 2023-05-12, 4 checkups in 2026; the Oct 18 checkup is wasting).
 * Checkups are immutable, so each run uses its own users and child with random UUIDs.
 */
const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

const measuredAtOf = (date: string) => `${date}T09:12:00-04:00`;

describe('WHO indicators computed on server (Mateo, end to end)', { timeout: 60000 }, () => {
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
      [userId, `indicators-${userId}@nutrikids.local`],
    );
    if (role === 'CAREGIVER') {
      await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+584120000000')`, [
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

  async function seedMateo(caregiverId: string): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, $4::date, $5)`,
      [childId, MATEO.firstName, MATEO.lastName, MATEO.birthDate, MATEO.sex],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'madre', true)`,
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

  /** Bogus values the phone "already computed": the server must ignore them. */
  const bogusClientResults = [
    'WEIGHT_FOR_AGE',
    'LENGTH_HEIGHT_FOR_AGE',
    'WEIGHT_FOR_LENGTH_HEIGHT',
    'BMI_FOR_AGE',
  ].map((indicator) => ({ indicator, zScore: 0, percentile: 50, classification: 'NORMAL' }));

  it('recomputes and stores the 4 indicators for each checkup, ignoring the phone values', async () => {
    const caregiver = await createUser('CAREGIVER');
    const pro = await createUser('PROFESSIONAL');
    const stranger = await createUser('CAREGIVER');
    const unlinkedPro = await createUser('PROFESSIONAL');
    const childId = await seedMateo(caregiver.userId);
    await linkProfessional(childId, pro.userId);

    const expected = buildMateoCheckups();
    const ids: string[] = [];

    // Caregiver records the first two checkups and the professional the other two.
    for (const [i, control] of MATEO_CONTROLS.entries()) {
      const author = i < 2 ? caregiver : pro;
      const id = crypto.randomUUID();
      ids.push(id);
      const res = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', author.token)
        .send({
          id,
          measuredAt: measuredAtOf(control.date),
          weightKg: control.weightKg,
          lengthHeightCm: control.lengthHeightCm,
          position: 'STANDING',
          results: bogusClientResults,
        });
      expect(res.status).toBe(201);
      if (author === caregiver) {
        expect(res.body).not.toHaveProperty('results');
      } else {
        expect(CheckupResponseSchema.safeParse(res.body).success).toBe(true);
      }
    }

    // Stored results (database) match the who-growth calculation, not the phone's.
    for (const [i, id] of ids.entries()) {
      const { rows } = await admin.query<{
        indicator: string;
        z_score: string;
        percentile: string;
        classification: string;
        reference_version: string;
      }>(
        `SELECT indicator, z_score, percentile, classification, reference_version
         FROM indicator_results WHERE checkup_id = $1 ORDER BY indicator`,
        [id],
      );
      expect(rows).toHaveLength(4);
      const stored = Object.fromEntries(rows.map((r) => [r.indicator, r]));
      for (const exp of expected[i]!.results) {
        const row = stored[exp.indicator]!;
        expect(Number(row.z_score)).toBeCloseTo(exp.zScore, 2);
        expect(Number(row.percentile)).toBeCloseTo(exp.percentile, 2);
        expect(row.classification).toBe(exp.classification);
        expect(row.reference_version).toBe(WHO_REFERENCE_VERSION);
      }
    }

    // Oct 18 checkup (12.2 kg, 97.0 cm): weight-for-height z ≈ -2.2 (wasting with WHO cutoffs).
    // Classification is compared with the configured cutoffs so the test does not depend on .env.
    const octId = ids[3]!;
    const asPro = await request(app)
      .get(`/checkups/${octId}/results`)
      .set('Authorization', pro.token);
    expect(asPro.status).toBe(200);
    expect(asPro.body).toHaveLength(4);
    for (const r of asPro.body) {
      expect(IndicatorResultSchema.safeParse(r).success).toBe(true);
    }
    const wflh = asPro.body.find(
      (r: { indicator: string }) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT',
    );
    const expectedWflh = expected[3]!.results.find(
      (r) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT',
    )!;
    expect(wflh.classification).toBe(expectedWflh.classification);
    const whoWflh = buildMateoCheckups(DEFAULT_CUTOFFS)[3]!.results.find(
      (r) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT',
    )!;
    expect(whoWflh.classification).toBe('WASTING');
    expect(Math.abs(wflh.zScore - -2.2)).toBeLessThanOrEqual(0.1);

    // Caregiver: same indicators, no z-score, percentile, or classification.
    const asCaregiver = await request(app)
      .get(`/checkups/${octId}/results`)
      .set('Authorization', caregiver.token);
    expect(asCaregiver.status).toBe(200);
    expect(asCaregiver.body).toHaveLength(4);
    for (const r of asCaregiver.body) {
      expect(CaregiverIndicatorResultSchema.strict().safeParse(r).success).toBe(true);
      expect(r).not.toHaveProperty('zScore');
      expect(r).not.toHaveProperty('percentile');
      expect(r).not.toHaveProperty('classification');
    }

    // Unlinked users and unknown checkups.
    const asStranger = await request(app)
      .get(`/checkups/${octId}/results`)
      .set('Authorization', stranger.token);
    const asUnlinkedPro = await request(app)
      .get(`/checkups/${octId}/results`)
      .set('Authorization', unlinkedPro.token);
    const missing = await request(app)
      .get(`/checkups/${crypto.randomUUID()}/results`)
      .set('Authorization', pro.token);
    const unauthenticated = await request(app).get(`/checkups/${octId}/results`);
    expect([403, 404]).toContain(asStranger.status);
    expect([403, 404]).toContain(asUnlinkedPro.status);
    expect(missing.status).toBe(404);
    expect(unauthenticated.status).toBe(401);
  });

  it('a correction recomputes the indicators for the new checkup', async () => {
    const caregiver = await createUser('CAREGIVER');
    const pro = await createUser('PROFESSIONAL');
    const childId = await seedMateo(caregiver.userId);
    await linkProfessional(childId, pro.userId);
    const oct = MATEO_CONTROLS[3]!;

    const original = {
      id: crypto.randomUUID(),
      measuredAt: measuredAtOf(oct.date),
      weightKg: oct.weightKg,
      lengthHeightCm: oct.lengthHeightCm,
      position: 'STANDING',
    };
    await request(app)
      .post(`/children/${childId}/checkups`)
      .set('Authorization', caregiver.token)
      .send(original)
      .expect(201);

    // The weight was mistyped: 14.2 kg instead of 12.2 kg -> no longer wasting.
    const fix = {
      ...original,
      id: crypto.randomUUID(),
      weightKg: 14.2,
      results: bogusClientResults,
    };
    await request(app)
      .post(`/checkups/${original.id}/correction`)
      .set('Authorization', caregiver.token)
      .send(fix)
      .expect(201);

    const get = (id: string) =>
      request(app).get(`/checkups/${id}/results`).set('Authorization', pro.token);
    const wflhOf = (body: { indicator: string; zScore: number; classification: string }[]) =>
      body.find((r) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT')!;
    const expectedWflh = (weightKg: number) =>
      computeIndicatorResults({
        sex: MATEO.sex,
        birthDate: new Date(`${MATEO.birthDate}T00:00:00Z`),
        measuredAt: new Date(original.measuredAt),
        weightKg,
        lengthHeightCm: oct.lengthHeightCm,
        position: 'STANDING',
      }).find((r) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT')!;

    const originalWflh = wflhOf((await get(original.id)).body);
    const fixWflh = wflhOf((await get(fix.id)).body);
    // The original keeps its results; the correction gets its own, recomputed from 14.2 kg.
    expect(originalWflh).toMatchObject({
      zScore: expectedWflh(oct.weightKg).zScore,
      classification: expectedWflh(oct.weightKg).classification,
    });
    expect(fixWflh).toMatchObject({
      zScore: expectedWflh(14.2).zScore,
      classification: expectedWflh(14.2).classification,
    });
    expect(fixWflh.zScore).toBeGreaterThan(originalWflh.zScore);
  });
});

describe('computeIndicatorResults with configurable cutoffs (RF-08)', () => {
  const oct = MATEO_CONTROLS[3]!;
  const params = {
    sex: MATEO.sex,
    birthDate: new Date(`${MATEO.birthDate}T00:00:00Z`),
    measuredAt: new Date(measuredAtOf(oct.date)),
    weightKg: oct.weightKg,
    lengthHeightCm: oct.lengthHeightCm,
    position: 'STANDING',
  };
  const wflhOf = (results: ReturnType<typeof computeIndicatorResults>) =>
    results.find((r) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT')!;

  it('uses the configured cutoffs by default (env.CLASSIFICATION_CUTOFFS)', () => {
    expect(computeIndicatorResults(params).map((r) => r.classification)).toEqual(
      computeIndicatorResults(params, env.CLASSIFICATION_CUTOFFS).map((r) => r.classification),
    );
    expect(wflhOf(computeIndicatorResults(params, DEFAULT_CUTOFFS)).classification).toBe('WASTING');
  });

  it('changing a cutoff changes the classification, not the z-score', () => {
    const base = wflhOf(computeIndicatorResults(params, DEFAULT_CUTOFFS));
    const relaxed = wflhOf(
      computeIndicatorResults(params, { ...DEFAULT_CUTOFFS, wastingWFLH: -2.5 }),
    );
    expect(relaxed.classification).toBe('NORMAL');
    expect(relaxed.zScore).toBe(base.zScore);
  });
});
