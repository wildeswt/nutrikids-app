import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { runErasureJob } from '../jobs/erasure.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../services/token.service.js';

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

describe('Derechos del representante (NK-41)', { timeout: 60000 }, () => {
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
       VALUES ($1, $2, 'secret-hash', 'Ana', 'Rep', 'active', now())`,
      [userId, `rights-${userId}@nutrikids.local`],
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
    return { userId, auth: `Bearer ${accessToken}` };
  }

  /** Niño de 30 meses con un representante legal, consentimiento vigente y datos asociados. */
  async function seedChild(rep: TestUser, withCheckup: boolean): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, 'Mateo', 'Rodriguez', CURRENT_DATE - 900, 'MALE')`,
      [childId],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', true)`,
      [rep.userId, childId],
    );
    await admin.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, rep.userId],
    );
    await admin.query(
      `INSERT INTO feeding_logs (id, child_id, log_date, meals_per_day, details)
       VALUES ($1, $2, CURRENT_DATE, 4, 'Mateo comió sopa')`,
      [crypto.randomUUID(), childId],
    );
    if (withCheckup) {
      await admin.query(
        `INSERT INTO checkups (id, child_id, measured_at, weight_kg, length_height_cm, position, origin, recorded_by_id)
         VALUES ($1, $2, now(), 12.0, 85.0, 'STANDING', 'CAREGIVER', $3)`,
        [crypto.randomUUID(), childId, rep.userId],
      );
    }
    return childId;
  }

  async function count(table: string, childId: string): Promise<number> {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${table} WHERE child_id = $1`,
      [childId],
    );
    return Number(rows[0]!.n);
  }

  async function waitForAudit(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
  ) {
    for (let i = 0; i < 30; i += 1) {
      const { rows } = await admin.query(
        `SELECT 1 FROM audit_logs WHERE user_id = $1 AND action = $2 AND entity_type = $3 AND entity_id = $4`,
        [userId, action, entityType, entityId],
      );
      if (rows.length > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  describe('PATCH /children/:childId (rectificación)', () => {
    it('cambia nombre y apellido, y nacimiento y sexo si no hay controles', async () => {
      const rep = await createUser('CAREGIVER');
      const childId = await seedChild(rep, false);

      const names = await request(app)
        .patch(`/children/${childId}`)
        .set('Authorization', rep.auth)
        .send({ firstName: '  Mateo José ', lastName: 'Rodríguez' });
      expect(names.status).toBe(200);
      expect(names.body).toMatchObject({
        id: childId,
        firstName: 'Mateo José',
        lastName: 'Rodríguez',
      });

      const birthDate = new Date(Date.now() - 600 * 86_400_000).toISOString().slice(0, 10);
      const identity = await request(app)
        .patch(`/children/${childId}`)
        .set('Authorization', rep.auth)
        .send({ birthDate, sex: 'FEMALE' });
      expect(identity.status).toBe(200);
      expect(identity.body).toMatchObject({ birthDate, sex: 'FEMALE' });

      expect(await waitForAudit(rep.userId, 'UPDATE', 'children', childId)).toBe(true);
    });

    it('no deja cambiar nacimiento ni sexo si el niño ya tiene controles (409)', async () => {
      const rep = await createUser('CAREGIVER');
      const childId = await seedChild(rep, true);

      const res = await request(app)
        .patch(`/children/${childId}`)
        .set('Authorization', rep.auth)
        .send({ sex: 'FEMALE' });
      expect(res.status).toBe(409);

      const okNames = await request(app)
        .patch(`/children/${childId}`)
        .set('Authorization', rep.auth)
        .send({ firstName: 'Mateo Andrés' });
      expect(okNames.status).toBe(200);
    });

    it('valida el cuerpo y el rango de edad (400)', async () => {
      const rep = await createUser('CAREGIVER');
      const childId = await seedChild(rep, false);
      const patch = (body: object) =>
        request(app).patch(`/children/${childId}`).set('Authorization', rep.auth).send(body);

      expect((await patch({})).status).toBe(400);
      expect((await patch({ id: crypto.randomUUID() })).status).toBe(400);
      expect((await patch({ birthDate: '2999-01-01' })).status).toBe(400);
      expect((await patch({ birthDate: '2000-01-01' })).status).toBe(400);
    });

    it('solo el representante legal puede ejercer los derechos (403)', async () => {
      const rep = await createUser('CAREGIVER');
      const coCaregiver = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(rep, false);
      await admin.query(
        `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
         VALUES ($1, $2, 'Tío', false)`,
        [coCaregiver.userId, childId],
      );

      for (const user of [coCaregiver, professional, await createUser('CAREGIVER')]) {
        const patch = await request(app)
          .patch(`/children/${childId}`)
          .set('Authorization', user.auth)
          .send({ firstName: 'Otro' });
        const exp = await request(app)
          .get(`/children/${childId}/export`)
          .set('Authorization', user.auth);
        const erase = await request(app)
          .post(`/children/${childId}/erasure-requests`)
          .set('Authorization', user.auth);
        expect([patch.status, exp.status, erase.status]).toEqual([403, 403, 403]);
      }
      expect((await request(app).get(`/children/${childId}/export`)).status).toBe(401);
    });
  });

  describe('GET /children/:childId/export', () => {
    it('descarga todos los datos del niño sin secretos de terceros y lo audita', async () => {
      const rep = await createUser('CAREGIVER');
      const childId = await seedChild(rep, true);

      const res = await request(app)
        .get(`/children/${childId}/export`)
        .set('Authorization', rep.auth);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="nutrikids-${childId}.json"`,
      );
      expect(res.body.child).toMatchObject({ id: childId, firstName: 'Mateo', sex: 'MALE' });
      expect(res.body.caregivers).toEqual([
        expect.objectContaining({
          name: 'Ana Rep',
          relationship: 'Madre',
          isLegalRepresentative: true,
        }),
      ]);
      expect(res.body.consents).toHaveLength(1);
      expect(res.body.checkups).toHaveLength(1);
      expect(res.body.checkups[0]).toMatchObject({
        weightKg: '12',
        lengthHeightCm: '85',
        origin: 'CAREGIVER',
      });
      expect(res.body.feedingLogs).toEqual([
        expect.objectContaining({ mealsPerDay: 4, details: 'Mateo comió sopa' }),
      ]);
      expect(JSON.stringify(res.body)).not.toContain('secret-hash');

      expect(await waitForAudit(rep.userId, 'EXPORT', 'children', childId)).toBe(true);
    });
  });

  describe('solicitud de eliminación', () => {
    it('se registra con plazo legal, es única mientras está pendiente y se puede cancelar', async () => {
      const rep = await createUser('CAREGIVER');
      const childId = await seedChild(rep, true);
      const url = `/children/${childId}/erasure-requests`;

      const created = await request(app).post(url).set('Authorization', rep.auth);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ childId, status: 'pending', resolvedAt: null });
      const days =
        (Date.parse(created.body.dueAt) - Date.parse(created.body.requestedAt)) / 86_400_000;
      expect(days).toBe(15);
      expect(await waitForAudit(rep.userId, 'CREATE', 'erasure_requests', created.body.id)).toBe(
        true,
      );

      expect((await request(app).post(url).set('Authorization', rep.auth)).status).toBe(409);

      const cancelled = await request(app)
        .delete(`${url}/${created.body.id}`)
        .set('Authorization', rep.auth);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect(cancelled.body.resolvedAt).not.toBeNull();
      expect(
        (await request(app).delete(`${url}/${created.body.id}`).set('Authorization', rep.auth))
          .status,
      ).toBe(409);
      expect(
        (await request(app).delete(`${url}/${crypto.randomUUID()}`).set('Authorization', rep.auth))
          .status,
      ).toBe(404);

      // Tras cancelar se puede pedir otra
      const again = await request(app).post(url).set('Authorization', rep.auth);
      expect(again.status).toBe(201);

      const list = await request(app).get(url).set('Authorization', rep.auth);
      expect(list.body.map((r: { status: string }) => r.status).sort()).toEqual([
        'cancelled',
        'pending',
      ]);
    });

    it('antes del plazo de gracia no se ejecuta; vencido, anonimiza al niño y conserva lo clínico', async () => {
      const rep = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(rep, true);
      await admin.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 30, NULL)`,
        [crypto.randomUUID(), childId, professional.userId],
      );
      await admin.query(
        `INSERT INTO follow_ups (id, child_id, professional_id, type, details)
         VALUES ($1, $2, $3, 'observation', 'Mateo vive con su abuela en Quito')`,
        [crypto.randomUUID(), childId, professional.userId],
      );
      await admin.query(
        `INSERT INTO reminders (id, child_id, type, scheduled_for, status)
         VALUES ($1, $2, 'checkup', now() + interval '3 days', 'pending')`,
        [crypto.randomUUID(), childId],
      );

      const created = await request(app)
        .post(`/children/${childId}/erasure-requests`)
        .set('Authorization', rep.auth);
      expect(created.status).toBe(201);

      // Recién pedida: dentro del plazo de gracia, no se toca nada.
      await runErasureJob();
      expect(
        (await admin.query(`SELECT first_name FROM children WHERE id = $1`, [childId])).rows[0]
          .first_name,
      ).toBe('Mateo');

      await admin.query(
        `UPDATE erasure_requests SET requested_at = now() - make_interval(days => $2) WHERE id = $1`,
        [created.body.id, env.ERASURE_GRACE_DAYS + 1],
      );
      const result = await runErasureJob();
      expect(result!.processed).toBeGreaterThanOrEqual(1);

      const child = (
        await admin.query(
          `SELECT first_name, last_name, birth_date, sex FROM children WHERE id = $1`,
          [childId],
        )
      ).rows[0];
      expect(child).toMatchObject({
        first_name: 'Anonimizado',
        last_name: 'Anonimizado',
        sex: 'MALE',
      });
      expect(new Date(child.birth_date).getUTCDate()).toBe(1);

      // Identidad y vínculos fuera
      expect(await count('caregiver_children', childId)).toBe(0);
      expect(await count('feeding_logs', childId)).toBe(0);
      expect(await count('reminders', childId)).toBe(0);
      expect(
        (await admin.query(`SELECT details FROM follow_ups WHERE child_id = $1`, [childId])).rows[0]
          .details,
      ).toBe('[eliminado por solicitud del representante]');
      expect(
        (await admin.query(`SELECT revoked_at FROM consents WHERE child_id = $1`, [childId]))
          .rows[0].revoked_at,
      ).not.toBeNull();
      expect(
        (
          await admin.query(
            `SELECT end_date <= CURRENT_DATE AS closed FROM professional_children WHERE child_id = $1`,
            [childId],
          )
        ).rows[0].closed,
      ).toBe(true);

      // Lo clínico inmutable se conserva, ya sin identidad
      expect(await count('checkups', childId)).toBe(1);
      const request_ = (
        await admin.query(`SELECT status, resolved_at FROM erasure_requests WHERE id = $1`, [
          created.body.id,
        ])
      ).rows[0];
      expect(request_.status).toBe('completed');
      expect(request_.resolved_at).not.toBeNull();
      expect(await waitForAudit(rep.userId, 'ERASE', 'children', childId)).toBe(true);

      // El representante ya no ve al niño y una segunda pasada no repite nada
      expect(
        (await request(app).get(`/children/${childId}`).set('Authorization', rep.auth)).status,
      ).toBe(403);
      await runErasureJob();
      expect(
        (
          await admin.query(
            `SELECT count(*) AS n FROM audit_logs WHERE action = 'ERASE' AND entity_id = $1`,
            [childId],
          )
        ).rows[0].n,
      ).toBe('1');
    });
  });
});
