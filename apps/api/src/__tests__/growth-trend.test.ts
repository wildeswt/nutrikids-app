import crypto from 'node:crypto';
import { GrowthTrendResponseSchema } from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../services/token.service.js';

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

describe(
  'Growth Trend API (GET /children/:childId/growth-trend, NK-74)',
  { timeout: 60000 },
  () => {
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
        [userId, `trend-${userId}@nutrikids.local`],
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

    async function linkProfessional(childId: string, professionalId: string): Promise<void> {
      await admin.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 30)`,
        [crypto.randomUUID(), childId, professionalId],
      );
    }

    async function insertCheckupWithResults(params: {
      childId: string;
      recordedById: string;
      measuredAt: string;
      correctedCheckupId?: string | null;
      results: Array<{
        indicator: string;
        zScore: number;
        classification: string;
      }>;
    }): Promise<string> {
      const checkupId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO checkups
          (id, child_id, measured_at, weight_kg, length_height_cm, position, origin, recorded_by_id, corrected_checkup_id)
         VALUES ($1, $2, $3::timestamptz, 12.5, 90.0, 'STANDING', 'CAREGIVER', $4, $5)`,
        [
          checkupId,
          params.childId,
          params.measuredAt,
          params.recordedById,
          params.correctedCheckupId ?? null,
        ],
      );

      for (const r of params.results) {
        await admin.query(
          `INSERT INTO indicator_results
            (id, checkup_id, indicator, z_score, percentile, classification, reference_version)
           VALUES ($1, $2, $3::"Indicator", $4, 50.0, $5, 'WHO 2006')`,
          [crypto.randomUUID(), checkupId, r.indicator, r.zScore, r.classification],
        );
      }

      return checkupId;
    }

    async function waitForAudit(childId: string): Promise<Record<string, unknown>[]> {
      let rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 30; i++) {
        rows = (
          await admin.query(
            `SELECT * FROM audit_logs WHERE action = 'READ' AND entity_type = 'checkups'
             AND entity_id = $1::uuid`,
            [childId],
          )
        ).rows;
        if (rows.length > 0) return rows;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return rows;
    }

    it('devuelve [] para un niño sin controles', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(GrowthTrendResponseSchema.safeParse(res.body).success).toBe(true);
    });

    it('devuelve FAVORABLE con un solo control si su clasificación es normal', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      const checkupId = await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-11-01T10:00:00Z',
        results: [
          { indicator: 'WEIGHT_FOR_AGE', zScore: 0.2, classification: 'NORMAL' },
          { indicator: 'LENGTH_HEIGHT_FOR_AGE', zScore: -0.1, classification: 'NORMAL' },
        ],
      });

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body).toEqual([
        {
          indicator: 'WEIGHT_FOR_AGE',
          trend: 'FAVORABLE',
          basedOnCheckupId: checkupId,
        },
        {
          indicator: 'LENGTH_HEIGHT_FOR_AGE',
          trend: 'FAVORABLE',
          basedOnCheckupId: checkupId,
        },
      ]);

      // RF-14: La respuesta no contiene zScore, percentile ni classification
      for (const item of res.body) {
        expect(item).not.toHaveProperty('zScore');
        expect(item).not.toHaveProperty('percentile');
        expect(item).not.toHaveProperty('classification');
      }
    });

    it('devuelve NONE si la clasificación del último control no es normal', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      const checkupId = await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-11-01T10:00:00Z',
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: -2.3, classification: 'UNDERWEIGHT' }],
      });

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          indicator: 'WEIGHT_FOR_AGE',
          trend: 'NONE',
          basedOnCheckupId: checkupId,
        },
      ]);
    });

    it('evalúa la frontera exacta de 0.5: favorable con exactamente 0.5, none con > 0.5', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      // Control vigente anterior: z = 0.0
      await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-10-01T10:00:00Z',
        results: [
          { indicator: 'WEIGHT_FOR_AGE', zScore: 0.0, classification: 'NORMAL' },
          { indicator: 'LENGTH_HEIGHT_FOR_AGE', zScore: 0.0, classification: 'NORMAL' },
        ],
      });

      // Último control vigente:
      // WFA: z = 0.50 (empeora exactamente 0.5 respecto a 0.0) -> FAVORABLE
      // LHFA: z = 0.51 (empeora más de 0.5 respecto a 0.0) -> NONE
      const latestId = await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-11-01T10:00:00Z',
        results: [
          { indicator: 'WEIGHT_FOR_AGE', zScore: 0.5, classification: 'NORMAL' },
          { indicator: 'LENGTH_HEIGHT_FOR_AGE', zScore: 0.51, classification: 'NORMAL' },
        ],
      });

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          indicator: 'WEIGHT_FOR_AGE',
          trend: 'FAVORABLE',
          basedOnCheckupId: latestId,
        },
        {
          indicator: 'LENGTH_HEIGHT_FOR_AGE',
          trend: 'NONE',
          basedOnCheckupId: latestId,
        },
      ]);
    });

    it('devuelve FAVORABLE si z mejora o se mantiene dentro de la tolerancia', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      // Control anterior con z = 1.2
      await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-09-01T10:00:00Z',
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: 1.2, classification: 'NORMAL' }],
      });

      // Último control con z = 0.4 (mejora hacia 0)
      const latestId = await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-10-01T10:00:00Z',
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: 0.4, classification: 'NORMAL' }],
      });

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          indicator: 'WEIGHT_FOR_AGE',
          trend: 'FAVORABLE',
          basedOnCheckupId: latestId,
        },
      ]);
    });

    it('ignora controles reemplazados por una corrección (isCurrent = false)', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      // Control 1 (antiguo vigente): z = 0.0
      await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-09-01T10:00:00Z',
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: 0.0, classification: 'NORMAL' }],
      });

      // Control 2 (fue reemplazado por error de tipeo, z = 1.8 que hubiera dado NONE)
      const replacedId = await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-10-01T10:00:00Z',
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: 1.8, classification: 'NORMAL' }],
      });

      // Control 2-corregido (vigente, z = 0.2 corregido): reemplaza al control 2
      const correctedId = await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-10-01T10:00:00Z',
        correctedCheckupId: replacedId,
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: 0.2, classification: 'NORMAL' }],
      });

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);

      expect(res.status).toBe(200);
      // Debe comparar el control vigente (correctedId, z=0.2) contra el anterior vigente (z=0.0)
      // |0.2| <= |0.0| + 0.5 -> FAVORABLE
      expect(res.body).toEqual([
        {
          indicator: 'WEIGHT_FOR_AGE',
          trend: 'FAVORABLE',
          basedOnCheckupId: correctedId,
        },
      ]);
    });

    it('permite acceso tanto a cuidador vinculado como a profesional vinculado', async () => {
      const caregiver = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId);
      await linkProfessional(childId, professional.userId);

      const checkupId = await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-11-01T10:00:00Z',
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: 0.1, classification: 'NORMAL' }],
      });

      // Cuidador vinculado
      const caregiverRes = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);
      expect(caregiverRes.status).toBe(200);
      expect(caregiverRes.body[0].basedOnCheckupId).toBe(checkupId);

      // Profesional vinculado
      const proRes = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', professional.token);
      expect(proRes.status).toBe(200);
      expect(proRes.body[0].basedOnCheckupId).toBe(checkupId);
    });

    it('rechaza con 403 a usuarios sin vínculo con el niño', async () => {
      const caregiver = await createUser('CAREGIVER');
      const stranger = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', stranger.token);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('No tienes acceso a este niño');
    });

    it('rechaza con 401 si no hay token de autenticación', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      const res = await request(app).get(`/children/${childId}/growth-trend`);
      expect(res.status).toBe(401);
    });

    it('registra evento de auditoría READ sobre checkups', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);

      await insertCheckupWithResults({
        childId,
        recordedById: caregiver.userId,
        measuredAt: '2026-11-01T10:00:00Z',
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: 0.1, classification: 'NORMAL' }],
      });

      const res = await request(app)
        .get(`/children/${childId}/growth-trend`)
        .set('Authorization', caregiver.token);

      expect(res.status).toBe(200);

      const auditLogs = await waitForAudit(childId);
      expect(auditLogs.length).toBeGreaterThan(0);
      const firstLog = auditLogs[0];
      expect(firstLog).toBeDefined();
      expect(firstLog?.action).toBe('READ');
      expect(firstLog?.entity_type).toBe('checkups');
      expect(firstLog?.user_id).toBe(caregiver.userId);
    });
  },
);
