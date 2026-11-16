import crypto from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { generateTotp } from '../lib/totp.js';
import { dispatchDueReminders } from '../services/reminders.service.js';
import { connectAdmin, createUser, isoHoursAgo, seedChild, waitForAudit } from './helpers/world.js';

/**
 * Pruebas de sistema (NK-46): flujos completos por HTTP contra la API y la base de datos real,
 * con datos sintéticos. PS-02/PS-03 del plan de pruebas del informe (Tabla 8).
 */
describe('Pruebas de sistema (NK-46)', { timeout: 90000 }, () => {
  const app = createApp();
  let admin: pg.Client;

  beforeAll(async () => {
    admin = await connectAdmin();
  });

  afterAll(async () => {
    await admin?.end();
    await prisma.$disconnect();
  });

  const PASSWORD = 'NutriKids-Test-2026!';

  it('registro → consentimiento → control → alerta → seguimiento → recordatorio', async () => {
    const suffix = crypto.randomUUID().slice(0, 8);

    // 1. Registro de un cuidador y de un profesional (con código de invitación) e inicio de sesión
    const registeredCaregiver = await request(app)
      .post('/auth/register')
      .send({
        email: `cuidadora-${suffix}@nutrikids.local`,
        password: PASSWORD,
        firstName: 'Ana',
        lastName: 'Sintetica',
        roles: ['CAREGIVER'],
      });
    expect(registeredCaregiver.status).toBe(201);
    const registeredPro = await request(app)
      .post('/auth/register')
      .send({
        email: `pediatra-${suffix}@nutrikids.local`,
        password: PASSWORD,
        firstName: 'Luis',
        lastName: 'Sintetico',
        roles: ['PROFESSIONAL'],
        specialty: 'pediatrics',
        licenseNumber: `LIC-${suffix}`,
        invitationCode: 'NK-PROF-2026',
      });
    expect(registeredPro.status).toBe(201);

    const caregiverLogin = await request(app)
      .post('/auth/login')
      .send({ email: `cuidadora-${suffix}@nutrikids.local`, password: PASSWORD });
    // El profesional debe dar el segundo factor (NK-10): primero activa con el secreto del QR.
    const proEmail = `pediatra-${suffix}@nutrikids.local`;
    const proSetup = await request(app)
      .post('/auth/login')
      .send({ email: proEmail, password: PASSWORD });
    expect(proSetup.body.requiresTwoFactor).toBe(true);
    const proLogin = await request(app)
      .post('/auth/login')
      .send({
        email: proEmail,
        password: PASSWORD,
        totpCode: generateTotp(proSetup.body.setup.secret as string),
      });
    expect(caregiverLogin.status).toBe(200);
    expect(proLogin.status).toBe(200);
    const caregiver = `Bearer ${caregiverLogin.body.accessToken as string}`;
    const pro = `Bearer ${proLogin.body.accessToken as string}`;
    const proId = proLogin.body.user.id as string;

    // 2. El representante da de alta al niño: queda el consentimiento vigente (RF-02, RF-03)
    const birth = new Date(Date.now() - 1095 * 86_400_000).toISOString().slice(0, 10);
    const child = await request(app).post('/children').set('Authorization', caregiver).send({
      firstName: 'Mateo',
      lastName: 'Sintetico',
      birthDate: birth,
      sex: 'MALE',
      relationship: 'Madre',
      isLegalRepresentative: true,
    });
    expect(child.status).toBe(201);
    const childId = child.body.id as string;
    const consent = await request(app)
      .get(`/children/${childId}/consent`)
      .set('Authorization', caregiver);
    expect(consent.status).toBe(200);
    expect(consent.body.revokedAt).toBeNull();

    // El profesional aún no tiene vínculo: no ve al niño (RT-05)
    expect((await request(app).get(`/children/${childId}`).set('Authorization', pro)).status).toBe(
      403,
    );

    // 3. Se asigna al profesional
    const assigned = await request(app)
      .post(`/children/${childId}/professionals`)
      .set('Authorization', caregiver)
      .send({ professionalId: proId });
    expect(assigned.status).toBe(201);
    expect((await request(app).get(`/children/${childId}`).set('Authorization', pro)).status).toBe(
      200,
    );

    // 4. El cuidador registra un control con bajo peso para la talla (RF-04, RF-07)
    const checkupId = crypto.randomUUID();
    const checkup = await request(app)
      .post(`/children/${childId}/checkups`)
      .set('Authorization', caregiver)
      .send({
        id: checkupId,
        measuredAt: isoHoursAgo(1),
        weightKg: 10,
        lengthHeightCm: 92,
        position: 'STANDING',
      });
    expect(checkup.status).toBe(201);
    expect(JSON.stringify(checkup.body)).not.toMatch(/zScore|percentile|classification/);

    // El servidor guardó los 4 indicadores
    const stored = await admin.query(
      `SELECT count(*)::int AS n FROM indicator_results WHERE checkup_id = $1`,
      [checkupId],
    );
    expect(stored.rows[0].n).toBe(4);

    // 5. Se generó una alerta y el profesional la recibe como pendiente de revisión (RF-11, RF-13)
    const inbox = await request(app).get('/alerts').query({ childId }).set('Authorization', pro);
    expect(inbox.status).toBe(200);
    const alert = (inbox.body as { id: string; riskType: string; status: string }[]).find(
      (a) => a.riskType === 'WASTING',
    );
    expect(alert).toBeDefined();
    expect(alert!.status).toBe('PENDING_REVIEW');
    const notified = await admin.query(
      `SELECT type FROM notifications WHERE user_id = $1 AND entity_id = $2`,
      [proId, alert!.id],
    );
    expect(notified.rows.map((r) => r.type)).toContain('alert_new');

    // El cuidador no puede ver la bandeja de alertas (RF-14)
    expect((await request(app).get('/alerts').set('Authorization', caregiver)).status).toBe(403);

    // 6. Revisión y seguimiento (RF-12, RF-15): no se salta estados ni se cierra sin seguimiento
    expect(
      (
        await request(app)
          .patch(`/alerts/${alert!.id}/status`)
          .set('Authorization', pro)
          .send({ status: 'FOLLOW_UP_ESTABLISHED' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch(`/alerts/${alert!.id}/status`)
          .set('Authorization', pro)
          .send({ status: 'REVIEWED' })
      ).status,
    ).toBe(200);

    const nextCheckup = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const followUp = await request(app)
      .post(`/children/${childId}/follow-ups`)
      .set('Authorization', pro)
      .send({
        id: crypto.randomUUID(),
        type: 'recommendation',
        details: 'Aumentar la frecuencia de comidas y volver a medir.',
        alertId: alert!.id,
        nextCheckupDate: nextCheckup,
      });
    expect(followUp.status).toBe(201);

    const closed = await request(app)
      .patch(`/alerts/${alert!.id}/status`)
      .set('Authorization', pro)
      .send({ status: 'FOLLOW_UP_ESTABLISHED' });
    expect(closed.status).toBe(200);
    expect(closed.body.history.map((h: { status: string }) => h.status)).toEqual([
      'GENERATED',
      'PENDING_REVIEW',
      'REVIEWED',
      'FOLLOW_UP_ESTABLISHED',
    ]);

    // 7. El recordatorio del próximo control existe para el cuidador y se notifica al acercarse (RF-16)
    const reminders = await request(app)
      .get('/reminders')
      .query({ childId })
      .set('Authorization', caregiver);
    expect(reminders.status).toBe(200);
    expect(reminders.body).toHaveLength(1);
    expect(reminders.body[0]).toMatchObject({ type: 'next_checkup', status: 'pending' });
    const reminderId = reminders.body[0].id as string;

    await admin.query(
      `UPDATE reminders SET scheduled_for = now() + interval '1 hour' WHERE id = $1`,
      [reminderId],
    );
    const dispatched = await dispatchDueReminders();
    expect(dispatched.processed).toBeGreaterThanOrEqual(1);
    const caregiverId = caregiverLogin.body.user.id as string;
    const reminderNotice = await admin.query(
      `SELECT type FROM notifications WHERE user_id = $1 AND entity_id = $2`,
      [caregiverId, reminderId],
    );
    expect(reminderNotice.rows.map((r) => r.type)).toEqual(['reminder_due']);
    const done = await request(app)
      .patch(`/reminders/${reminderId}/complete`)
      .set('Authorization', caregiver);
    expect(done.body.status).toBe('completed');

    // 8. Quedó la huella de auditoría del control y el cuidador no puede consultarla (RF-21)
    expect(
      await waitForAudit(admin, {
        userId: caregiverId,
        action: 'CREATE',
        entityType: 'checkups',
      }),
    ).toBe(true);
    expect((await request(app).get('/audit').set('Authorization', caregiver)).status).toBe(403);
    const audit = await request(app)
      .get('/audit')
      .query({ userId: caregiverId, entityType: 'checkups' })
      .set('Authorization', pro);
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).toContain(caregiverId);
  });

  it('un control enviado dos veces, o desde varios dispositivos a la vez, queda una sola vez (PS-02)', async () => {
    const caregiver = await createUser(admin, 'CAREGIVER');
    const childId = await seedChild(admin, caregiver.userId);

    const checkup = {
      id: crypto.randomUUID(),
      measuredAt: isoHoursAgo(2),
      weightKg: 13.5,
      lengthHeightCm: 92.5,
      position: 'STANDING',
    };
    const post = () =>
      request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.auth)
        .send(checkup);

    const statuses = (await Promise.all([post(), post(), post()])).map((r) => r.status);
    expect(statuses.every((s) => s === 200 || s === 201)).toBe(true);
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(1);

    const batch = {
      checkups: [
        {
          ...checkup,
          id: crypto.randomUUID(),
          childId,
          measuredAt: isoHoursAgo(3),
        },
      ],
    };
    const sync = () =>
      request(app).post('/sync/checkups').set('Authorization', caregiver.auth).send(batch);
    const synced = await Promise.all([sync(), sync(), sync()]);
    expect(synced.every((r) => r.status === 200)).toBe(true);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM checkups WHERE id = ANY($1::uuid[])`,
      [[checkup.id, batch.checkups[0]!.id]],
    );
    expect(rows[0].n).toBe(2);
    const results = await admin.query(
      `SELECT count(*)::int AS n FROM indicator_results WHERE checkup_id = ANY($1::uuid[])`,
      [[checkup.id, batch.checkups[0]!.id]],
    );
    expect(results.rows[0].n).toBe(8);
  });

  it('una corrección crea un registro nuevo y el original no se modifica (PI-02)', async () => {
    const caregiver = await createUser(admin, 'CAREGIVER');
    const childId = await seedChild(admin, caregiver.userId);
    const original = {
      id: crypto.randomUUID(),
      measuredAt: isoHoursAgo(5),
      weightKg: 14,
      lengthHeightCm: 94,
      position: 'STANDING',
    };
    expect(
      (
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.auth)
          .send(original)
      ).status,
    ).toBe(201);

    const before = await admin.query(`SELECT * FROM checkups WHERE id = $1`, [original.id]);
    const correction = await request(app)
      .post(`/checkups/${original.id}/correction`)
      .set('Authorization', caregiver.auth)
      .send({ ...original, id: crypto.randomUUID(), weightKg: 13.2 });
    expect(correction.status).toBe(201);
    const after = await admin.query(`SELECT * FROM checkups WHERE id = $1`, [original.id]);
    expect(after.rows[0]).toEqual(before.rows[0]);

    // No hay ruta para editar un control (se corrige) y DELETE es solo eliminación lógica
    for (const method of ['put', 'patch'] as const) {
      const res = await request(app)
        [method](`/checkups/${original.id}`)
        .set('Authorization', caregiver.auth)
        .send({ weightKg: 1 });
      expect(res.status).toBe(404);
    }
    const history = await request(app)
      .get(`/children/${childId}/checkups`)
      .set('Authorization', caregiver.auth);
    expect(history.body).toHaveLength(2);
  });
});
