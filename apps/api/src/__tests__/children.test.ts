import crypto from 'node:crypto';
import {
  CaregiverAssignmentResponseSchema,
  ChildResponseSchema,
  ConsentResponseSchema,
  ProfessionalAssignmentResponseSchema,
  completedMonths,
} from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { assertChildAgeInOmsRange, createChild } from '../services/children.service.js';
import { signAccessToken } from '../services/token.service.js';

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDateDaysFromToday(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Construye una fecha `YYYY-MM-DD` tal que `completedMonths(fecha, hoy) === monthsAgo`
 * en cualquier día del año (clamp al último día del mes objetivo).
 */
function isoDateExactMonthsAgo(monthsAgo: number): string {
  const now = new Date();
  const ty = now.getUTCFullYear();
  const tm = now.getUTCMonth();
  const td = now.getUTCDate();

  const totalMonths = ty * 12 + tm - monthsAgo;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(td, maxDay);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10);
}

describe('API de Niños y Vínculos (/children) - RF-03', { timeout: 60000 }, () => {
  const app = createApp();
  let adminClient: pg.Client;

  const createdUserIds: string[] = [];
  const createdChildIds: string[] = [];

  beforeAll(async () => {
    adminClient = new pg.Client({ connectionString: adminConnectionString });
    await adminClient.connect();
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Limpiar todos los registros de niños creados en el test (incluidos los creados vía POST /children)
    if (createdUserIds.length > 0 || createdChildIds.length > 0) {
      const childIdsResult = await adminClient.query<{ child_id: string }>(
        `SELECT DISTINCT child_id FROM caregiver_children WHERE caregiver_id = ANY($1::uuid[])
         UNION
         SELECT DISTINCT child_id FROM professional_children WHERE professional_id = ANY($1::uuid[])
         UNION
         SELECT UNNEST($2::uuid[]) AS child_id`,
        [createdUserIds, createdChildIds],
      );
      const allChildIds = childIdsResult.rows.map((r) => r.child_id).filter(Boolean);

      if (allChildIds.length > 0) {
        // consents tiene ON DELETE RESTRICT respecto a child y caregiver
        await adminClient.query(`DELETE FROM consents WHERE child_id = ANY($1::uuid[])`, [
          allChildIds,
        ]);
        await adminClient.query(`DELETE FROM children WHERE id = ANY($1::uuid[])`, [allChildIds]);
      }

      if (createdUserIds.length > 0) {
        await adminClient.query(`DELETE FROM consents WHERE caregiver_id = ANY($1::uuid[])`, [
          createdUserIds,
        ]);
        await adminClient.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }

      createdUserIds.length = 0;
      createdChildIds.length = 0;
    }
  });

  afterAll(async () => {
    await adminClient?.end();
    await prisma.$disconnect();
  });

  async function createTestUser(options: {
    roles: ('CAREGIVER' | 'PROFESSIONAL')[];
    specialty?: 'nursing' | 'nutrition' | 'pediatrics';
    status?: 'active' | 'suspended';
    firstName?: string;
    lastName?: string;
  }): Promise<{ userId: string; email: string; token: string }> {
    const userId = crypto.randomUUID();
    const email = `test-${userId}@nutrikids.local`;
    const firstName = options.firstName ?? 'Test';
    const lastName = options.lastName ?? 'User';
    const status = options.status ?? 'active';

    await adminClient.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', $3, $4, $5, now())`,
      [userId, email, firstName, lastName, status],
    );
    createdUserIds.push(userId);

    if (options.roles.includes('CAREGIVER')) {
      await adminClient.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+593990000')`, [
        userId,
      ]);
    }
    if (options.roles.includes('PROFESSIONAL')) {
      await adminClient.query(
        `INSERT INTO professionals (user_id, specialty, license_number)
         VALUES ($1, $2, $3)`,
        [userId, options.specialty ?? 'pediatrics', `LIC-${userId.slice(0, 8)}`],
      );
    }

    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: options.roles,
      specialty: options.roles.includes('PROFESSIONAL')
        ? (options.specialty ?? 'pediatrics')
        : null,
    });

    return { userId, email, token: `Bearer ${accessToken}` };
  }

  async function seedChildDirect(options: {
    caregiverId: string;
    birthDate?: string;
    isLegalRepresentative?: boolean;
    firstName?: string;
    lastName?: string;
  }): Promise<string> {
    const childId = crypto.randomUUID();
    const birthDate = options.birthDate ?? isoDateExactMonthsAgo(24);
    await adminClient.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, $4::date, 'MALE')`,
      [childId, options.firstName ?? 'Mateo', options.lastName ?? 'López', birthDate],
    );
    createdChildIds.push(childId);

    await adminClient.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', $3)`,
      [options.caregiverId, childId, options.isLegalRepresentative ?? true],
    );

    await adminClient.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version)
       VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, options.caregiverId],
    );

    return childId;
  }

  // ─── POST /children ──────────────────────────────────────────────────────

  describe('POST /children', () => {
    it('crea niño, vínculo cuida (representante legal) y consentimiento inicial atómicamente con solo datos mínimos', async () => {
      const caregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const birthDate = isoDateExactMonthsAgo(30);

      const res = await request(app).post('/children').set('Authorization', caregiver.token).send({
        firstName: 'Sofía',
        lastName: 'Morales',
        birthDate,
        sex: 'FEMALE',
        relationship: 'Madre',
        isLegalRepresentative: true,
      });

      expect(res.status).toBe(201);
      const parsed = ChildResponseSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);
      expect(Object.keys(res.body).sort()).toEqual(
        ['id', 'firstName', 'lastName', 'birthDate', 'sex'].sort(),
      );
      expect(res.body).toMatchObject({
        firstName: 'Sofía',
        lastName: 'Morales',
        birthDate,
        sex: 'FEMALE',
      });

      // Verificar vínculo cuida y consentimiento en BD
      const linkRes = await adminClient.query(
        `SELECT relationship, is_legal_representative FROM caregiver_children WHERE caregiver_id = $1 AND child_id = $2`,
        [caregiver.userId, res.body.id],
      );
      expect(linkRes.rows).toEqual([{ relationship: 'Madre', is_legal_representative: true }]);

      const consentRes = await adminClient.query(
        `SELECT caregiver_id, text_version, revoked_at FROM consents WHERE child_id = $1`,
        [res.body.id],
      );
      expect(consentRes.rows).toEqual([
        { caregiver_id: caregiver.userId, text_version: 'v1', revoked_at: null },
      ]);
    });

    it('acepta exactamente 12 meses y 60 meses cumplidos al registrarse', async () => {
      const caregiver = await createTestUser({ roles: ['CAREGIVER'] });

      const res12 = await request(app)
        .post('/children')
        .set('Authorization', caregiver.token)
        .send({
          firstName: 'Bebe',
          lastName: 'Doce',
          birthDate: isoDateExactMonthsAgo(12),
          sex: 'MALE',
          relationship: 'Padre',
          isLegalRepresentative: true,
          consentTextVersion: 'v2-2026',
        });
      expect(res12.status).toBe(201);

      const consentRes = await adminClient.query(
        `SELECT text_version FROM consents WHERE child_id = $1`,
        [res12.body.id],
      );
      expect(consentRes.rows[0].text_version).toBe('v2-2026');

      const res60 = await request(app)
        .post('/children')
        .set('Authorization', caregiver.token)
        .send({
          firstName: 'Niño',
          lastName: 'Sesenta',
          birthDate: isoDateExactMonthsAgo(60),
          sex: 'FEMALE',
          relationship: 'Madre',
          isLegalRepresentative: true,
        });
      expect(res60.status).toBe(201);
    });

    it('rechaza niño menor de 12 meses (400)', async () => {
      const caregiver = await createTestUser({ roles: ['CAREGIVER'] });

      const res = await request(app)
        .post('/children')
        .set('Authorization', caregiver.token)
        .send({
          firstName: 'Lucas',
          lastName: 'Menor',
          birthDate: isoDateExactMonthsAgo(11),
          sex: 'MALE',
          relationship: 'Madre',
          isLegalRepresentative: true,
        });

      expect(res.status).toBe(400);
    });

    it('rechaza niño mayor de 60 meses (400)', async () => {
      const caregiver = await createTestUser({ roles: ['CAREGIVER'] });

      const res = await request(app)
        .post('/children')
        .set('Authorization', caregiver.token)
        .send({
          firstName: 'Carlos',
          lastName: 'Mayor',
          birthDate: isoDateExactMonthsAgo(61),
          sex: 'MALE',
          relationship: 'Padre',
          isLegalRepresentative: true,
        });

      expect(res.status).toBe(400);
    });

    it('rechaza si isLegalRepresentative es false en ruta (400) y en servicio (403)', async () => {
      const caregiver = await createTestUser({ roles: ['CAREGIVER'] });

      const res = await request(app)
        .post('/children')
        .set('Authorization', caregiver.token)
        .send({
          firstName: 'Pedro',
          lastName: 'Rojas',
          birthDate: isoDateExactMonthsAgo(24),
          sex: 'MALE',
          relationship: 'Tía',
          isLegalRepresentative: false,
        });
      expect(res.status).toBe(400);

      await expect(
        createChild(
          { userId: caregiver.userId, roles: ['CAREGIVER'], specialty: null },
          {
            firstName: 'Pedro',
            lastName: 'Rojas',
            birthDate: isoDateExactMonthsAgo(24),
            sex: 'MALE',
            relationship: 'Tía',
            isLegalRepresentative: false,
            consentTextVersion: 'v1',
          },
        ),
      ).rejects.toThrow(/representante legal/i);
    });

    it('rechaza con 403 si quien registra solo tiene rol PROFESSIONAL', async () => {
      const prof = await createTestUser({ roles: ['PROFESSIONAL'], specialty: 'pediatrics' });

      const res = await request(app)
        .post('/children')
        .set('Authorization', prof.token)
        .send({
          firstName: 'Ana',
          lastName: 'Ruiz',
          birthDate: isoDateExactMonthsAgo(24),
          sex: 'FEMALE',
          relationship: 'Madre',
          isLegalRepresentative: true,
        });

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /children y GET /children/:childId ──────────────────────────────

  describe('GET /children y GET /children/:childId', () => {
    it('cada cuidador solo lista y lee sus propios niños; el ajeno devuelve 403', async () => {
      const caregiverA = await createTestUser({ roles: ['CAREGIVER'] });
      const caregiverB = await createTestUser({ roles: ['CAREGIVER'] });

      const childA = await seedChildDirect({
        caregiverId: caregiverA.userId,
        firstName: 'Lucía',
        lastName: 'Arias',
      });
      const childB = await seedChildDirect({
        caregiverId: caregiverB.userId,
        firstName: 'Diego',
        lastName: 'Bustos',
      });

      const listA = await request(app).get('/children').set('Authorization', caregiverA.token);
      expect(listA.status).toBe(200);
      expect(listA.body.map((c: { id: string }) => c.id)).toEqual([childA]);

      const getOwn = await request(app)
        .get(`/children/${childA}`)
        .set('Authorization', caregiverA.token);
      expect(getOwn.status).toBe(200);
      expect(Object.keys(getOwn.body).sort()).toEqual(
        ['id', 'firstName', 'lastName', 'birthDate', 'sex'].sort(),
      );

      const getOther = await request(app)
        .get(`/children/${childB}`)
        .set('Authorization', caregiverA.token);
      expect(getOther.status).toBe(403);
    });

    it('mantiene legibles en GET los niños que hoy superan los 60 meses para preservar historial', async () => {
      const caregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const olderChild = await seedChildDirect({
        caregiverId: caregiver.userId,
        birthDate: isoDateExactMonthsAgo(72),
        firstName: 'Elena',
      });

      const listRes = await request(app).get('/children').set('Authorization', caregiver.token);
      expect(listRes.status).toBe(200);
      expect(listRes.body.map((c: { id: string }) => c.id)).toContain(olderChild);

      const getRes = await request(app)
        .get(`/children/${olderChild}`)
        .set('Authorization', caregiver.token);
      expect(getRes.status).toBe(200);
    });

    it('profesional solo ve niños con vínculo atiende vigente (ni vencido ni futuro)', async () => {
      const caregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const prof = await createTestUser({ roles: ['PROFESSIONAL'], specialty: 'nutrition' });

      const activeChild = await seedChildDirect({
        caregiverId: caregiver.userId,
        firstName: 'Vigente',
      });
      const expiredChild = await seedChildDirect({
        caregiverId: caregiver.userId,
        firstName: 'Expirado',
      });
      const futureChild = await seedChildDirect({
        caregiverId: caregiver.userId,
        firstName: 'Futuro',
      });

      await adminClient.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
         VALUES
           ($1, $2, $3, CURRENT_DATE - 5, NULL),
           ($4, $5, $3, CURRENT_DATE - 10, CURRENT_DATE - 1),
           ($6, $7, $3, CURRENT_DATE + 1, NULL)`,
        [
          crypto.randomUUID(),
          activeChild,
          prof.userId,
          crypto.randomUUID(),
          expiredChild,
          crypto.randomUUID(),
          futureChild,
        ],
      );

      const listRes = await request(app).get('/children').set('Authorization', prof.token);
      expect(listRes.status).toBe(200);
      expect(listRes.body.map((c: { id: string }) => c.id)).toEqual([activeChild]);

      expect(
        (await request(app).get(`/children/${activeChild}`).set('Authorization', prof.token))
          .status,
      ).toBe(200);
      expect(
        (await request(app).get(`/children/${expiredChild}`).set('Authorization', prof.token))
          .status,
      ).toBe(403);
      expect(
        (await request(app).get(`/children/${futureChild}`).set('Authorization', prof.token))
          .status,
      ).toBe(403);
    });
  });

  // ─── Gestión de vínculos atiende (profesionales) ─────────────────────────

  describe('Asignación y finalización de profesionales (/children/:childId/professionals)', () => {
    it('el representante legal asigna profesional, consulta lista y rechaza duplicado (409)', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const prof = await createTestUser({
        roles: ['PROFESSIONAL'],
        specialty: 'pediatrics',
        firstName: 'Laura',
        lastName: 'Gómez',
      });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      // 1. Antes de asignar, el profesional no tiene acceso
      const beforeGet = await request(app)
        .get(`/children/${childId}`)
        .set('Authorization', prof.token);
      expect(beforeGet.status).toBe(403);

      // 2. Representante legal asigna al profesional
      const assignRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', legalRep.token)
        .send({ professionalId: prof.userId });

      expect(assignRes.status).toBe(201);
      expect(ProfessionalAssignmentResponseSchema.safeParse(assignRes.body).success).toBe(true);
      expect(assignRes.body).toMatchObject({
        childId,
        professionalId: prof.userId,
        specialty: 'pediatrics',
        firstName: 'Laura',
        lastName: 'Gómez',
        startDate: todayUtcIso(),
        endDate: null,
      });

      // 3. Profesional ahora puede leer al niño y aparece en GET /professionals
      const duringGet = await request(app)
        .get(`/children/${childId}`)
        .set('Authorization', prof.token);
      expect(duringGet.status).toBe(200);

      const profListRes = await request(app)
        .get(`/children/${childId}/professionals`)
        .set('Authorization', legalRep.token);
      expect(profListRes.status).toBe(200);
      expect(profListRes.body).toHaveLength(1);
      expect(profListRes.body[0].professionalId).toBe(prof.userId);

      // 4. Intentar asignar nuevamente al mismo profesional mientras está vigente -> 409 Conflict
      const dupRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', legalRep.token)
        .send({ professionalId: prof.userId });
      expect(dupRes.status).toBe(409);
    });

    it('el representante legal finaliza vínculo (valida endDate >= startDate, revoca acceso y permite re-asignar)', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const prof = await createTestUser({
        roles: ['PROFESSIONAL'],
        specialty: 'pediatrics',
      });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      // Asignamos vínculo iniciado hace 10 días
      await adminClient.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 10)`,
        [crypto.randomUUID(), childId, prof.userId],
      );

      // 1. Finalizar con endDate anterior a startDate -> 400 Bad Request
      const invalidEndRes = await request(app)
        .patch(`/children/${childId}/professionals/${prof.userId}/end`)
        .set('Authorization', legalRep.token)
        .send({ endDate: isoDateDaysFromToday(-20) });
      expect(invalidEndRes.status).toBe(400);

      // 2. Finalizar con endDate = ayer -> 200 OK y revoca acceso inmediatamente
      const endYesterdayRes = await request(app)
        .patch(`/children/${childId}/professionals/${prof.userId}/end`)
        .set('Authorization', legalRep.token)
        .send({ endDate: isoDateDaysFromToday(-1) });
      expect(endYesterdayRes.status).toBe(200);
      expect(endYesterdayRes.body.endDate).toBe(isoDateDaysFromToday(-1));

      const afterEndGet = await request(app)
        .get(`/children/${childId}`)
        .set('Authorization', prof.token);
      expect(afterEndGet.status).toBe(403);

      // 3. Al estar finalizado en el pasado, permite re-asignar al mismo profesional desde hoy
      const reassignRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', legalRep.token)
        .send({ professionalId: prof.userId });
      expect(reassignRes.status).toBe(201);
    });

    it('un profesional con vínculo vigente puede derivar a otro profesional y también finalizar su propia atención', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const nurse = await createTestUser({ roles: ['PROFESSIONAL'], specialty: 'nursing' });
      const nutritionist = await createTestUser({
        roles: ['PROFESSIONAL'],
        specialty: 'nutrition',
      });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      // Representante legal asigna enfermera desde hace 5 días
      await adminClient.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 5)`,
        [crypto.randomUUID(), childId, nurse.userId],
      );

      // Enfermera vinculada deriva al nutricionista
      const referralRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', nurse.token)
        .send({ professionalId: nutritionist.userId });
      expect(referralRes.status).toBe(201);

      // Enfermera NO puede finalizar el vínculo del nutricionista (solo el suyo propio) -> 403 Forbidden
      const endOtherProfRes = await request(app)
        .patch(`/children/${childId}/professionals/${nutritionist.userId}/end`)
        .set('Authorization', nurse.token)
        .send({ endDate: todayUtcIso() });
      expect(endOtherProfRes.status).toBe(403);

      // Enfermera finaliza su propio vínculo (hasta ayer) y pierde acceso
      const selfEndRes = await request(app)
        .patch(`/children/${childId}/professionals/${nurse.userId}/end`)
        .set('Authorization', nurse.token)
        .send({ endDate: isoDateDaysFromToday(-1) });
      expect(selfEndRes.status).toBe(200);

      const afterSelfEnd = await request(app)
        .get(`/children/${childId}`)
        .set('Authorization', nurse.token);
      expect(afterSelfEnd.status).toBe(403);

      // Nutricionista conserva su vínculo
      const nutriGet = await request(app)
        .get(`/children/${childId}`)
        .set('Authorization', nutritionist.token);
      expect(nutriGet.status).toBe(200);
    });

    it('impide a un profesional sin vínculo auto-asignarse (403) y a un cuidador no representante legal asignar/finalizar (403)', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const secondaryCaregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const linkedProf = await createTestUser({ roles: ['PROFESSIONAL'], specialty: 'pediatrics' });
      const strangerProf = await createTestUser({
        roles: ['PROFESSIONAL'],
        specialty: 'pediatrics',
      });

      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      // Vincular cuidador secundario (no representante legal) y profesional vigente
      await adminClient.query(
        `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
         VALUES ($1, $2, 'Tío', false)`,
        [secondaryCaregiver.userId, childId],
      );
      await adminClient.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 1)`,
        [crypto.randomUUID(), childId, linkedProf.userId],
      );

      // Profesional ajeno intenta auto-asignarse -> 403
      const strangerRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', strangerProf.token)
        .send({ professionalId: strangerProf.userId });
      expect(strangerRes.status).toBe(403);

      // Cuidador secundario puede leer al niño (200), pero NO puede asignar (403) ni finalizar (403)
      const secRead = await request(app)
        .get(`/children/${childId}`)
        .set('Authorization', secondaryCaregiver.token);
      expect(secRead.status).toBe(200);

      const secAssign = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', secondaryCaregiver.token)
        .send({ professionalId: strangerProf.userId });
      expect(secAssign.status).toBe(403);

      const secEnd = await request(app)
        .patch(`/children/${childId}/professionals/${linkedProf.userId}/end`)
        .set('Authorization', secondaryCaregiver.token)
        .send({ endDate: todayUtcIso() });
      expect(secEnd.status).toBe(403);
    });

    it('devuelve 404 al asignar un profesional inexistente o suspendido y al finalizar vínculo inexistente', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const suspendedProf = await createTestUser({
        roles: ['PROFESSIONAL'],
        status: 'suspended',
      });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });
      const missingProfId = crypto.randomUUID();

      const missingRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', legalRep.token)
        .send({ professionalId: missingProfId });
      expect(missingRes.status).toBe(404);

      const suspendedRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', legalRep.token)
        .send({ professionalId: suspendedProf.userId });
      expect(suspendedRes.status).toBe(404);

      const endMissingRes = await request(app)
        .patch(`/children/${childId}/professionals/${missingProfId}/end`)
        .set('Authorization', legalRep.token)
        .send({ endDate: todayUtcIso() });
      expect(endMissingRes.status).toBe(404);
    });
  });

  // ─── Gestión de vínculos cuida (cuidadores) ──────────────────────────────

  describe('Gestión de vínculos con cuidadores (/children/:childId/caregivers)', () => {
    it('el representante legal vincula a un segundo cuidador (por email), actualiza su parentesco, lista y lo desvincula', async () => {
      const legalRep = await createTestUser({
        roles: ['CAREGIVER'],
        firstName: 'María',
        lastName: 'Pérez',
      });
      const secondCaregiver = await createTestUser({
        roles: ['CAREGIVER'],
        firstName: 'Carlos',
        lastName: 'Pérez',
      });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      // 1. Antes de vincular, el segundo cuidador no tiene acceso al niño (403)
      expect(
        (await request(app).get(`/children/${childId}`).set('Authorization', secondCaregiver.token))
          .status,
      ).toBe(403);

      // 2. Representante legal vincula al segundo cuidador por email (isLegalRepresentative = false por defecto)
      const assignRes = await request(app)
        .post(`/children/${childId}/caregivers`)
        .set('Authorization', legalRep.token)
        .send({
          email: secondCaregiver.email.toUpperCase(),
          relationship: 'Padre',
        });

      expect(assignRes.status).toBe(201);
      expect(CaregiverAssignmentResponseSchema.safeParse(assignRes.body).success).toBe(true);
      expect(assignRes.body).toEqual({
        caregiverId: secondCaregiver.userId,
        childId,
        firstName: 'Carlos',
        lastName: 'Pérez',
        email: secondCaregiver.email,
        relationship: 'Padre',
        isLegalRepresentative: false,
      });

      // 3. Intentar vincular de nuevo al mismo cuidador -> 409 Conflict
      const dupRes = await request(app)
        .post(`/children/${childId}/caregivers`)
        .set('Authorization', legalRep.token)
        .send({
          caregiverId: secondCaregiver.userId,
          relationship: 'Padre',
        });
      expect(dupRes.status).toBe(409);

      // 4. El segundo cuidador ahora puede ver al niño y listar los cuidadores (200)
      const listRes = await request(app)
        .get(`/children/${childId}/caregivers`)
        .set('Authorization', secondCaregiver.token);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(2);

      // 5. Representante legal actualiza el parentesco del segundo cuidador (200)
      const patchRes = await request(app)
        .patch(`/children/${childId}/caregivers/${secondCaregiver.userId}`)
        .set('Authorization', legalRep.token)
        .send({ relationship: 'Abuelo paterno' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.relationship).toBe('Abuelo paterno');

      // 6. Representante legal desvincula al segundo cuidador (204) y este pierde acceso (403)
      const delRes = await request(app)
        .delete(`/children/${childId}/caregivers/${secondCaregiver.userId}`)
        .set('Authorization', legalRep.token);
      expect(delRes.status).toBe(204);

      expect(
        (await request(app).get(`/children/${childId}`).set('Authorization', secondCaregiver.token))
          .status,
      ).toBe(403);
    });

    it('impide que un cuidador secundario o un profesional gestionen vínculos de cuidadores (403) y protege al único representante legal (409)', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const secondaryCaregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const thirdCaregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const linkedProf = await createTestUser({ roles: ['PROFESSIONAL'], specialty: 'pediatrics' });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      await adminClient.query(
        `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
         VALUES ($1, $2, 'Tía', false)`,
        [secondaryCaregiver.userId, childId],
      );
      await adminClient.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 1)`,
        [crypto.randomUUID(), childId, linkedProf.userId],
      );

      // Cuidador secundario intenta agregar, editar o eliminar -> 403 Forbidden
      expect(
        (
          await request(app)
            .post(`/children/${childId}/caregivers`)
            .set('Authorization', secondaryCaregiver.token)
            .send({ caregiverId: thirdCaregiver.userId, relationship: 'Abuelo' })
        ).status,
      ).toBe(403);

      expect(
        (
          await request(app)
            .patch(`/children/${childId}/caregivers/${secondaryCaregiver.userId}`)
            .set('Authorization', secondaryCaregiver.token)
            .send({ isLegalRepresentative: true })
        ).status,
      ).toBe(403);

      expect(
        (
          await request(app)
            .delete(`/children/${childId}/caregivers/${secondaryCaregiver.userId}`)
            .set('Authorization', secondaryCaregiver.token)
        ).status,
      ).toBe(403);

      // Profesional con vínculo vigente puede listar cuidadores (200), pero NO agregar/eliminar (403)
      expect(
        (
          await request(app)
            .get(`/children/${childId}/caregivers`)
            .set('Authorization', linkedProf.token)
        ).status,
      ).toBe(200);

      expect(
        (
          await request(app)
            .post(`/children/${childId}/caregivers`)
            .set('Authorization', linkedProf.token)
            .send({ caregiverId: thirdCaregiver.userId, relationship: 'Abuelo' })
        ).status,
      ).toBe(403);

      // Representante legal único intenta quitarse isLegalRepresentative o eliminarse -> 409 Conflict
      const demoteLastRep = await request(app)
        .patch(`/children/${childId}/caregivers/${legalRep.userId}`)
        .set('Authorization', legalRep.token)
        .send({ isLegalRepresentative: false });
      expect(demoteLastRep.status).toBe(409);

      const deleteLastRep = await request(app)
        .delete(`/children/${childId}/caregivers/${legalRep.userId}`)
        .set('Authorization', legalRep.token);
      expect(deleteLastRep.status).toBe(409);

      // Si primero promueve al cuidador secundario a representante legal, ahora sí puede quitarse a sí mismo
      const promoteSec = await request(app)
        .patch(`/children/${childId}/caregivers/${secondaryCaregiver.userId}`)
        .set('Authorization', legalRep.token)
        .send({ isLegalRepresentative: true });
      expect(promoteSec.status).toBe(200);

      const demoteFirst = await request(app)
        .patch(`/children/${childId}/caregivers/${legalRep.userId}`)
        .set('Authorization', secondaryCaregiver.token)
        .send({ isLegalRepresentative: false });
      expect(demoteFirst.status).toBe(200);
      expect(demoteFirst.body.isLegalRepresentative).toBe(false);
    });

    it('devuelve 404 cuando el cuidador destino no existe, está suspendido o no tiene vínculo con el niño', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const suspendedCaregiver = await createTestUser({
        roles: ['CAREGIVER'],
        status: 'suspended',
      });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });
      const unknownId = crypto.randomUUID();

      expect(
        (
          await request(app)
            .post(`/children/${childId}/caregivers`)
            .set('Authorization', legalRep.token)
            .send({ caregiverId: unknownId, relationship: 'Tío' })
        ).status,
      ).toBe(404);

      expect(
        (
          await request(app)
            .post(`/children/${childId}/caregivers`)
            .set('Authorization', legalRep.token)
            .send({ caregiverId: suspendedCaregiver.userId, relationship: 'Tío' })
        ).status,
      ).toBe(404);

      expect(
        (
          await request(app)
            .patch(`/children/${childId}/caregivers/${unknownId}`)
            .set('Authorization', legalRep.token)
            .send({ relationship: 'Tío' })
        ).status,
      ).toBe(404);

      expect(
        (
          await request(app)
            .delete(`/children/${childId}/caregivers/${unknownId}`)
            .set('Authorization', legalRep.token)
        ).status,
      ).toBe(404);
    });
  });

  // ─── Gestión de consentimiento informado (/children/:childId/consent) ──

  describe('Consentimiento informado (/children/:childId/consent) - RF-02', () => {
    it('obtiene consentimiento inicial, renueva con nueva versión, revoca lógicamente y bloquea duplicados', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      // 1. Consultar consentimiento creado en el alta (200 OK)
      const getRes = await request(app)
        .get(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token);
      expect(getRes.status).toBe(200);
      expect(ConsentResponseSchema.safeParse(getRes.body).success).toBe(true);
      expect(getRes.body).toMatchObject({
        childId,
        grantedById: legalRep.userId,
        textVersion: 'v1',
        revokedAt: null,
      });

      // 2. Intentar otorgar la misma versión vigente -> 409 Conflict
      const dupRes = await request(app)
        .post(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token)
        .send({ textVersion: 'v1' });
      expect(dupRes.status).toBe(409);

      // 3. Renovar con nueva versión 'v2' -> 201 Created y revoca la anterior
      const renewRes = await request(app)
        .post(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token)
        .send({ textVersion: 'v2' });
      expect(renewRes.status).toBe(201);
      expect(renewRes.body.textVersion).toBe('v2');
      expect(renewRes.body.revokedAt).toBeNull();

      // Verificar en BD que v1 ahora tiene revoked_at not null y v2 tiene null
      const consentsInDb = await adminClient.query(
        `SELECT text_version, revoked_at FROM consents WHERE child_id = $1 ORDER BY granted_at ASC`,
        [childId],
      );
      expect(consentsInDb.rows).toHaveLength(2);
      expect(consentsInDb.rows[0].text_version).toBe('v1');
      expect(consentsInDb.rows[0].revoked_at).not.toBeNull();
      expect(consentsInDb.rows[1].text_version).toBe('v2');
      expect(consentsInDb.rows[1].revoked_at).toBeNull();

      // 4. Revocar el consentimiento vigente -> 200 OK
      const revokeRes = await request(app)
        .delete(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.revokedAt).not.toBeNull();

      // 5. Intentar revocar nuevamente cuando ya está revocado -> 409 Conflict
      const reRevokeRes = await request(app)
        .delete(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token);
      expect(reRevokeRes.status).toBe(409);

      // 6. Al consultar tras revocación, devuelve el último con revokedAt
      const getRevokedRes = await request(app)
        .get(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token);
      expect(getRevokedRes.status).toBe(200);
      expect(getRevokedRes.body.revokedAt).not.toBeNull();

      // 7. Volver a otorgar tras revocación -> 201 Created
      const reGrantRes = await request(app)
        .post(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token)
        .send({ textVersion: 'v3' });
      expect(reGrantRes.status).toBe(201);
      expect(reGrantRes.body.textVersion).toBe('v3');
      expect(reGrantRes.body.revokedAt).toBeNull();
    });

    it('impide a un cuidador secundario o profesional otorgar o revocar consentimiento (403)', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const secondaryCaregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const linkedProf = await createTestUser({ roles: ['PROFESSIONAL'], specialty: 'pediatrics' });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      await adminClient.query(
        `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
         VALUES ($1, $2, 'Tío', false)`,
        [secondaryCaregiver.userId, childId],
      );
      await adminClient.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 1)`,
        [crypto.randomUUID(), childId, linkedProf.userId],
      );

      // Profesional y cuidador secundario pueden leer el consentimiento con permiso child:read
      expect(
        (
          await request(app)
            .get(`/children/${childId}/consent`)
            .set('Authorization', secondaryCaregiver.token)
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .get(`/children/${childId}/consent`)
            .set('Authorization', linkedProf.token)
        ).status,
      ).toBe(200);

      // Cuidador secundario no puede otorgar ni revocar (403)
      expect(
        (
          await request(app)
            .post(`/children/${childId}/consent`)
            .set('Authorization', secondaryCaregiver.token)
            .send({ textVersion: 'v2' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .delete(`/children/${childId}/consent`)
            .set('Authorization', secondaryCaregiver.token)
        ).status,
      ).toBe(403);

      // Profesional no puede otorgar ni revocar (403)
      expect(
        (
          await request(app)
            .post(`/children/${childId}/consent`)
            .set('Authorization', linkedProf.token)
            .send({ textVersion: 'v2' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .delete(`/children/${childId}/consent`)
            .set('Authorization', linkedProf.token)
        ).status,
      ).toBe(403);
    });

    it('el trigger de BD en checkups aborta inserción sin consentimiento activo', async () => {
      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const childId = await seedChildDirect({ caregiverId: legalRep.userId });

      // Revocar el consentimiento en BD
      await adminClient.query(`UPDATE consents SET revoked_at = now() WHERE child_id = $1`, [
        childId,
      ]);

      const insertCheckup = adminClient.query(
        `INSERT INTO checkups (id, child_id, measured_at, weight_kg, length_height_cm, position, origin, recorded_by_id)
         VALUES ($1, $2, now(), 12.0, 85.0, 'STANDING', 'CAREGIVER', $3)`,
        [crypto.randomUUID(), childId, legalRep.userId],
      );

      await expect(insertCheckup).rejects.toThrow(/active consent/i);
    });
  });

  // ─── Helper assertChildAgeInOmsRange (>60m policy) ───────────────────────

  describe('assertChildAgeInOmsRange (política > 60 meses para futuros controles)', () => {
    it('acepta 12 a 60 meses cumplidos en la fecha del control y rechaza fuera de rango con 400', () => {
      expect(completedMonths('2023-05-12', '2028-05-12')).toBe(60);
      expect(() => assertChildAgeInOmsRange('2023-05-12', '2028-05-12')).not.toThrow();
      expect(() => assertChildAgeInOmsRange('2023-05-12', '2024-05-12')).not.toThrow();

      expect(() => assertChildAgeInOmsRange('2023-05-12', '2028-06-12')).toThrow(HttpError);
      expect(() => assertChildAgeInOmsRange('2023-05-12', '2024-05-11')).toThrow(HttpError);
    });
  });

  // ─── Flujo completo bajo RLS estricto con rol nutrikids_app ───────────────

  describe('Ejecución bajo RLS estricto con rol nutrikids_app (FK diferida + políticas)', () => {
    it('completa alta atómica, lectura y asignación/finalización con SET LOCAL ROLE nutrikids_app', async () => {
      const originalTx = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: unknown, opts?: unknown) => {
        if (typeof fn === 'function') {
          return originalTx(async (tx) => {
            await tx.$executeRawUnsafe('SET LOCAL ROLE nutrikids_app');
            return (fn as (txClient: typeof tx) => Promise<unknown>)(tx);
          }, opts as never);
        }
        return originalTx(fn as never, opts as never);
      }) as never);

      const legalRep = await createTestUser({ roles: ['CAREGIVER'] });
      const secondCaregiver = await createTestUser({ roles: ['CAREGIVER'] });
      const prof = await createTestUser({ roles: ['PROFESSIONAL'], specialty: 'pediatrics' });

      // Alta atómica bajo RLS estricto + FK diferida
      const createRes = await request(app)
        .post('/children')
        .set('Authorization', legalRep.token)
        .send({
          firstName: 'Valentina',
          lastName: 'Silva',
          birthDate: isoDateExactMonthsAgo(36),
          sex: 'FEMALE',
          relationship: 'Madre',
          isLegalRepresentative: true,
        });
      expect(createRes.status).toBe(201);
      const childId = createRes.body.id as string;

      // Gestión de cuidadores bajo RLS estricto
      const addCaregiverRes = await request(app)
        .post(`/children/${childId}/caregivers`)
        .set('Authorization', legalRep.token)
        .send({ caregiverId: secondCaregiver.userId, relationship: 'Padre' });
      expect(addCaregiverRes.status).toBe(201);

      const delCaregiverRes = await request(app)
        .delete(`/children/${childId}/caregivers/${secondCaregiver.userId}`)
        .set('Authorization', legalRep.token);
      expect(delCaregiverRes.status).toBe(204);

      // Lectura y asignación bajo RLS estricto
      const assignRes = await request(app)
        .post(`/children/${childId}/professionals`)
        .set('Authorization', legalRep.token)
        .send({ professionalId: prof.userId });
      expect(assignRes.status).toBe(201);

      const profReadRes = await request(app)
        .get(`/children/${childId}`)
        .set('Authorization', prof.token);
      expect(profReadRes.status).toBe(200);

      // Finalizar con today bajo RLS estricto
      const endRes = await request(app)
        .patch(`/children/${childId}/professionals/${prof.userId}/end`)
        .set('Authorization', legalRep.token)
        .send({ endDate: todayUtcIso() });
      expect(endRes.status).toBe(200);

      // Gestión de consentimiento bajo RLS estricto
      const getConsentRes = await request(app)
        .get(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token);
      expect(getConsentRes.status).toBe(200);

      const revokeConsentRes = await request(app)
        .delete(`/children/${childId}/consent`)
        .set('Authorization', legalRep.token);
      expect(revokeConsentRes.status).toBe(200);
      expect(revokeConsentRes.body.revokedAt).not.toBeNull();
    });
  });
});
