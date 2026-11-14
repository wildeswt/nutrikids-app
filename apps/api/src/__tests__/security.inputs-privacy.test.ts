import crypto from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../services/token.service.js';
import { connectAdmin, createUser, isoHoursAgo, seedChild } from './helpers/world.js';

/**
 * Pruebas de seguridad de entradas (PSEG: inyección SQL, sesiones) y de privacidad (PPRI:
 * consentimiento y revocación) del plan de pruebas (NK-46). Datos sintéticos únicamente.
 */
describe('Seguridad de entradas y privacidad (NK-46)', { timeout: 90000 }, () => {
  const app = createApp();
  let admin: pg.Client;

  beforeAll(async () => {
    admin = await connectAdmin();
  });

  afterAll(async () => {
    await admin?.end();
    await prisma.$disconnect();
  });

  const INJECTIONS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    '" OR ""="',
    '1; SELECT pg_sleep(5); --',
    "Robert'); DROP TABLE children;--",
  ];

  async function tableCount(table: string): Promise<number> {
    const { rows } = await admin.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
    return Number(rows[0]!.n);
  }

  describe('inyección SQL y validación de entradas (PSEG-01)', () => {
    it('el inicio de sesión rechaza cargas de inyección sin error de servidor ni acceso', async () => {
      for (const payload of INJECTIONS) {
        const asEmail = await request(app)
          .post('/auth/login')
          .send({ email: payload, password: 'NutriKids-Test-2026!' });
        expect(asEmail.status, `email: ${payload}`).toBe(400);

        const asPassword = await request(app)
          .post('/auth/login')
          .send({ email: `inexistente-${crypto.randomUUID()}@nutrikids.local`, password: payload });
        expect(asPassword.status, `password: ${payload}`).toBe(401);
        expect(asPassword.body.accessToken).toBeUndefined();
      }
    });

    it('los parámetros de ruta y de consulta con inyección dan 400/403/404, nunca 500', async () => {
      const caregiver = await createUser(admin, 'CAREGIVER');
      const usersBefore = await tableCount('users');
      const childrenBefore = await tableCount('children');

      for (const payload of INJECTIONS) {
        const encoded = encodeURIComponent(payload);
        for (const path of [
          `/children/${encoded}`,
          `/children/${encoded}/checkups`,
          `/alerts?childId=${encoded}`,
          `/reminders?childId=${encoded}`,
          `/audit?entityId=${encoded}`,
        ]) {
          const res = await request(app).get(path).set('Authorization', caregiver.auth);
          expect([400, 403, 404], `${path} → ${res.status}`).toContain(res.status);
        }
      }
      expect(await tableCount('users')).toBe(usersBefore);
      expect(await tableCount('children')).toBe(childrenBefore);
    });

    it('un texto con SQL se guarda como texto y no altera la base', async () => {
      const caregiver = await createUser(admin, 'CAREGIVER');
      const childId = await seedChild(admin, caregiver.userId);
      const name = "Robert'); DROP TABLE children;--";

      const res = await request(app)
        .patch(`/children/${childId}`)
        .set('Authorization', caregiver.auth)
        .send({ firstName: name });
      expect(res.status).toBe(200);
      const { rows } = await admin.query(`SELECT first_name FROM children WHERE id = $1`, [
        childId,
      ]);
      expect(rows[0].first_name).toBe(name);
      expect(await tableCount('children')).toBeGreaterThan(0);
    });

    it('cuerpos con campos de más o tipos equivocados se rechazan (400)', async () => {
      const caregiver = await createUser(admin, 'CAREGIVER');
      const childId = await seedChild(admin, caregiver.userId);
      const base = {
        id: crypto.randomUUID(),
        measuredAt: isoHoursAgo(1),
        weightKg: 12,
        lengthHeightCm: 90,
        position: 'STANDING',
      };

      for (const body of [
        { ...base, origin: 'PROFESSIONAL' },
        { ...base, weightKg: '12; DROP TABLE checkups' },
        { ...base, weightKg: -3 },
        { ...base, id: "x' OR '1'='1" },
        { ...base, position: 'LYING' },
      ]) {
        const res = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.auth)
          .send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
    });
  });

  describe('sesiones (PSEG-01)', () => {
    it('sin token, con token alterado o con token vencido se responde 401', async () => {
      const caregiver = await createUser(admin, 'CAREGIVER');
      const token = caregiver.auth.replace('Bearer ', '');
      const [header, payload, signature] = token.split('.') as [string, string, string];
      const tampered = `${header}.${payload}.${signature.slice(0, -2)}${signature.endsWith('A') ? 'BB' : 'AA'}`;

      for (const authorization of [undefined, 'Bearer basura', `Bearer ${tampered}`, 'Basic abc']) {
        const req = request(app).get('/children');
        const res = authorization ? await req.set('Authorization', authorization) : await req;
        expect(res.status, String(authorization)).toBe(401);
      }

      const { accessToken: expired } = await signAccessToken(
        { sub: caregiver.userId, roles: ['CAREGIVER'], specialty: null },
        { ttlSeconds: -3600 },
      );
      const res = await request(app).get('/children').set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });
  });

  describe('privacidad: consentimiento y revocación (PPRI-01)', () => {
    const checkupBody = () => ({
      id: crypto.randomUUID(),
      measuredAt: isoHoursAgo(1),
      weightKg: 12,
      lengthHeightCm: 90,
      position: 'STANDING',
    });

    it('sin consentimiento no se guardan controles, ni por la API ni por la sincronización', async () => {
      const caregiver = await createUser(admin, 'CAREGIVER');
      const childId = await seedChild(admin, caregiver.userId, { consent: false });

      const direct = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.auth)
        .send(checkupBody());
      expect(direct.status).toBe(403);

      const synced = await request(app)
        .post('/sync/checkups')
        .set('Authorization', caregiver.auth)
        .send({ checkups: [{ ...checkupBody(), childId }] });
      expect(synced.status).not.toBe(201);
      expect(JSON.stringify(synced.body)).not.toMatch(/"status":"created"/);

      const { rows } = await admin.query(`SELECT 1 FROM checkups WHERE child_id = $1`, [childId]);
      expect(rows).toHaveLength(0);
    });

    it('al revocar el consentimiento se detienen los registros nuevos y se conserva lo anterior', async () => {
      const caregiver = await createUser(admin, 'CAREGIVER');
      const childId = await seedChild(admin, caregiver.userId);

      const before = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.auth)
        .send(checkupBody());
      expect(before.status).toBe(201);

      const revoked = await request(app)
        .delete(`/children/${childId}/consent`)
        .set('Authorization', caregiver.auth);
      expect(revoked.status).toBe(200);

      const after = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.auth)
        .send(checkupBody());
      expect(after.status).toBe(403);

      const { rows } = await admin.query(`SELECT 1 FROM checkups WHERE child_id = $1`, [childId]);
      expect(rows).toHaveLength(1);
    });

    it('el representante ejerce sus derechos: exporta y la eliminación queda registrada con plazo de 15 días', async () => {
      const caregiver = await createUser(admin, 'CAREGIVER');
      const childId = await seedChild(admin, caregiver.userId);

      const exported = await request(app)
        .get(`/children/${childId}/export`)
        .set('Authorization', caregiver.auth);
      expect(exported.status).toBe(200);
      expect(exported.headers['content-disposition']).toContain('attachment');

      const erasure = await request(app)
        .post(`/children/${childId}/erasure-requests`)
        .set('Authorization', caregiver.auth);
      expect(erasure.status).toBe(201);
      const days =
        (Date.parse(erasure.body.dueAt) - Date.parse(erasure.body.requestedAt)) / 86_400_000;
      expect(days).toBeLessThanOrEqual(15);
    });
  });
});
