import crypto from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { createApp } from '../app.js';
import {
  connectAdmin,
  createUser,
  seedChild,
  waitForAudit,
  type TestUser,
} from './helpers/world.js';

/** Búsqueda de profesionales por registro (GET /professionals/lookup) y vínculo con consentimiento. */
describe('Profesionales: búsqueda por registro y vínculo', { timeout: 90000 }, () => {
  const app = createApp();
  let admin: pg.Client;
  let caregiver: TestUser;
  let pro: TestUser;
  let proLicense: string;
  let inactivePro: TestUser;
  let inactiveLicense: string;

  async function licenseOf(userId: string): Promise<string> {
    const { rows } = await admin.query(
      `SELECT license_number FROM professionals WHERE user_id = $1`,
      [userId],
    );
    return rows[0].license_number as string;
  }

  beforeAll(async () => {
    admin = await connectAdmin();
    caregiver = await createUser(admin, 'CAREGIVER');
    pro = await createUser(admin, 'PROFESSIONAL', 'nutrition');
    proLicense = await licenseOf(pro.userId);
    inactivePro = await createUser(admin, 'PROFESSIONAL', 'nursing');
    inactiveLicense = await licenseOf(inactivePro.userId);
    await admin.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [inactivePro.userId]);
  });

  afterAll(async () => {
    await admin.end();
  });

  it('exige autenticación', async () => {
    const res = await request(app).get('/professionals/lookup').query({ license: proLicense });
    expect(res.status).toBe(401);
  });

  it('rechaza a un profesional con 403', async () => {
    const res = await request(app)
      .get('/professionals/lookup')
      .set('Authorization', pro.auth)
      .query({ license: proLicense });
    expect(res.status).toBe(403);
  });

  it('valida el parámetro license', async () => {
    const res = await request(app)
      .get('/professionals/lookup')
      .set('Authorization', caregiver.auth)
      .query({ license: '   ' });
    expect(res.status).toBe(400);
  });

  it('devuelve solo id, nombre, apellido y especialidad, y audita el acierto', async () => {
    const res = await request(app)
      .get('/professionals/lookup')
      .set('Authorization', caregiver.auth)
      .query({ license: ` ${proLicense} ` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      professionalId: pro.userId,
      firstName: 'Prueba',
      lastName: 'Profesional',
      specialty: 'nutrition',
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(pro.email);
    expect(raw).not.toContain(proLicense);
    expect(
      await waitForAudit(admin, {
        userId: caregiver.userId,
        action: 'READ',
        entityType: 'professionals',
        entityId: pro.userId,
      }),
    ).toBe(true);
  });

  it('responde 404 genérico si no existe o está inactivo, y audita igualmente', async () => {
    const missing = await request(app)
      .get('/professionals/lookup')
      .set('Authorization', caregiver.auth)
      .query({ license: 'NO-EXISTE-123' });
    const inactive = await request(app)
      .get('/professionals/lookup')
      .set('Authorization', caregiver.auth)
      .query({ license: inactiveLicense });
    expect(missing.status).toBe(404);
    expect(inactive.status).toBe(404);
    expect(inactive.body.message).toBe(missing.body.message);
    const { rows } = await admin.query(
      `SELECT details FROM audit_logs
        WHERE user_id = $1 AND entity_type = 'professionals' AND entity_id IS NULL`,
      [caregiver.userId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(rows)).not.toContain('NO-EXISTE-123');
  });

  it('limita los intentos (429), contando también los fallos', async () => {
    const limited = await createUser(admin, 'CAREGIVER');
    const limitedApp = createApp();
    for (let i = 0; i < env.LOOKUP_MAX_ATTEMPTS; i += 1) {
      const res = await request(limitedApp)
        .get('/professionals/lookup')
        .set('Authorization', limited.auth)
        .query({ license: `NOPE-${i}` });
      expect(res.status).toBe(404);
    }
    const blocked = await request(limitedApp)
      .get('/professionals/lookup')
      .set('Authorization', limited.auth)
      .query({ license: proLicense });
    expect(blocked.status).toBe(429);
  });

  it('exige consentimiento vigente para vincular al profesional', async () => {
    const childId = await seedChild(admin, caregiver.userId, { consent: false });
    const noConsent = await request(app)
      .post(`/children/${childId}/professionals`)
      .set('Authorization', caregiver.auth)
      .send({ professionalId: pro.userId });
    expect(noConsent.status).toBe(403);
    expect(noConsent.body.message).toContain('consentimiento');

    await admin.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, caregiver.userId],
    );
    const ok = await request(app)
      .post(`/children/${childId}/professionals`)
      .set('Authorization', caregiver.auth)
      .send({ professionalId: pro.userId });
    expect(ok.status).toBe(201);
  });
});
