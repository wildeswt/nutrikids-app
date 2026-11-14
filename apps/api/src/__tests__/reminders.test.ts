import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { runRemindersJob } from '../jobs/overdue-alerts.js';
import { prisma } from '../lib/prisma.js';
import { dispatchDueReminders } from '../services/reminders.service.js';
import { signAccessToken } from '../services/token.service.js';

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

const HOUR_MS = 3_600_000;

function inHours(hours: number): string {
  return new Date(Date.now() + hours * HOUR_MS).toISOString();
}

describe('Recordatorios (NK-37)', { timeout: 60000 }, () => {
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
       VALUES ($1, $2, 'hash', 'Test', 'User', 'active', now())`,
      [userId, `reminder-${userId}@nutrikids.local`],
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

  async function seedChild(caregiverId: string, withConsent = true): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, 'Mateo', 'Recordatorio', CURRENT_DATE - 900, 'MALE')`,
      [childId],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', true)`,
      [caregiverId, childId],
    );
    if (withConsent) {
      await admin.query(
        `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
        [crypto.randomUUID(), childId, caregiverId],
      );
    }
    return childId;
  }

  async function insertReminder(
    childId: string,
    scheduledFor: string,
    status = 'pending',
  ): Promise<string> {
    const id = crypto.randomUUID();
    await admin.query(
      `INSERT INTO reminders (id, child_id, type, scheduled_for, status)
       VALUES ($1, $2, 'next_checkup', $3, $4)`,
      [id, childId, scheduledFor, status],
    );
    return id;
  }

  async function reminderStatus(id: string): Promise<string> {
    const { rows } = await admin.query<{ status: string }>(
      `SELECT status FROM reminders WHERE id = $1`,
      [id],
    );
    return rows[0]!.status;
  }

  async function notificationsFor(userId: string, reminderId: string) {
    const { rows } = await admin.query<{ type: string; entity_type: string }>(
      `SELECT type, entity_type FROM notifications WHERE user_id = $1 AND entity_id = $2`,
      [userId, reminderId],
    );
    return rows;
  }

  describe('POST /reminders', () => {
    it('crea un recordatorio, es idempotente por id y el cuidador lo lista y lo completa', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);
      const body = {
        id: crypto.randomUUID(),
        childId,
        type: 'activity',
        scheduledFor: inHours(72),
      };

      const created = await request(app)
        .post('/reminders')
        .set('Authorization', caregiver.auth)
        .send(body);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        id: body.id,
        childId,
        type: 'activity',
        status: 'pending',
        scheduledFor: new Date(body.scheduledFor).toISOString(),
      });

      const again = await request(app)
        .post('/reminders')
        .set('Authorization', caregiver.auth)
        .send(body);
      expect(again.status).toBe(200);
      const { rows } = await admin.query(`SELECT 1 FROM reminders WHERE id = $1`, [body.id]);
      expect(rows).toHaveLength(1);

      const list = await request(app)
        .get(`/reminders?childId=${childId}&status=pending`)
        .set('Authorization', caregiver.auth);
      expect(list.status).toBe(200);
      expect(list.body.map((r: { id: string }) => r.id)).toEqual([body.id]);

      const done = await request(app)
        .patch(`/reminders/${body.id}/complete`)
        .set('Authorization', caregiver.auth);
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('completed');
      expect(await reminderStatus(body.id)).toBe('completed');

      const doneAgain = await request(app)
        .patch(`/reminders/${body.id}/complete`)
        .set('Authorization', caregiver.auth);
      expect(doneAgain.status).toBe(200);

      const pendingAfter = await request(app)
        .get(`/reminders?childId=${childId}&status=pending`)
        .set('Authorization', caregiver.auth);
      expect(pendingAfter.body).toEqual([]);
    });

    it('rechaza fecha pasada, tipo reservado y campos desconocidos (400)', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);
      const base = { childId, type: 'checkup', scheduledFor: inHours(48) };

      for (const bad of [
        { ...base, id: crypto.randomUUID(), scheduledFor: inHours(-2) },
        { ...base, id: crypto.randomUUID(), type: 'next_checkup' },
        { ...base, id: crypto.randomUUID(), status: 'completed' },
        { ...base, id: 'no-es-uuid' },
      ]) {
        const res = await request(app)
          .post('/reminders')
          .set('Authorization', caregiver.auth)
          .send(bad);
        expect(res.status).toBe(400);
      }
    });

    it('exige vínculo con el niño y consentimiento vigente (403)', async () => {
      const caregiver = await createUser('CAREGIVER');
      const stranger = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);
      const noConsentChild = await seedChild(caregiver.userId, false);
      const make = (child: string) => ({
        id: crypto.randomUUID(),
        childId: child,
        type: 'checkup',
        scheduledFor: inHours(48),
      });

      const unlinked = await request(app)
        .post('/reminders')
        .set('Authorization', stranger.auth)
        .send(make(childId));
      expect(unlinked.status).toBe(403);

      const noConsent = await request(app)
        .post('/reminders')
        .set('Authorization', caregiver.auth)
        .send(make(noConsentChild));
      expect(noConsent.status).toBe(403);

      const anonymous = await request(app).post('/reminders').send(make(childId));
      expect(anonymous.status).toBe(401);
    });

    it('un id ya usado para otro niño responde 409', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childA = await seedChild(caregiver.userId);
      const childB = await seedChild(caregiver.userId);
      const id = crypto.randomUUID();
      const send = (childId: string) =>
        request(app)
          .post('/reminders')
          .set('Authorization', caregiver.auth)
          .send({ id, childId, type: 'checkup', scheduledFor: inHours(48) });

      expect((await send(childA)).status).toBe(201);
      expect((await send(childB)).status).toBe(409);
    });
  });

  describe('GET /reminders y PATCH /reminders/:id/complete (RLS)', () => {
    it('cada usuario solo ve y completa los recordatorios de sus niños', async () => {
      const owner = await createUser('CAREGIVER');
      const stranger = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(owner.userId);
      await admin.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
         VALUES ($1, $2, $3, CURRENT_DATE - 30, NULL)`,
        [crypto.randomUUID(), childId, professional.userId],
      );
      const reminderId = await insertReminder(childId, inHours(100));

      const asOwner = await request(app).get('/reminders').set('Authorization', owner.auth);
      expect(asOwner.body.map((r: { id: string }) => r.id)).toContain(reminderId);

      const asProfessional = await request(app)
        .get(`/reminders?childId=${childId}`)
        .set('Authorization', professional.auth);
      expect(asProfessional.body.map((r: { id: string }) => r.id)).toEqual([reminderId]);

      const asStranger = await request(app).get('/reminders').set('Authorization', stranger.auth);
      expect(asStranger.status).toBe(200);
      expect(asStranger.body.map((r: { id: string }) => r.id)).not.toContain(reminderId);

      const strangerComplete = await request(app)
        .patch(`/reminders/${reminderId}/complete`)
        .set('Authorization', stranger.auth);
      expect(strangerComplete.status).toBe(404);
      expect(await reminderStatus(reminderId)).toBe('pending');

      const missing = await request(app)
        .patch(`/reminders/${crypto.randomUUID()}/complete`)
        .set('Authorization', owner.auth);
      expect(missing.status).toBe(404);

      const badQuery = await request(app)
        .get('/reminders?status=otro')
        .set('Authorization', owner.auth);
      expect(badQuery.status).toBe(400);
    });
  });

  describe('dispatchDueReminders / runRemindersJob', () => {
    it('avisa a los cuidadores solo de los recordatorios dentro de la anticipación, una sola vez', async () => {
      const caregiver = await createUser('CAREGIVER');
      const coCaregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);
      await admin.query(
        `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
         VALUES ($1, $2, 'Padre', false)`,
        [coCaregiver.userId, childId],
      );

      const due = await insertReminder(childId, inHours(env.REMINDER_LEAD_HOURS - 1));
      const overdue = await insertReminder(childId, inHours(-5));
      const later = await insertReminder(childId, inHours(env.REMINDER_LEAD_HOURS + 24));
      const done = await insertReminder(childId, inHours(1), 'completed');

      const first = await dispatchDueReminders();
      expect(first.processed).toBeGreaterThanOrEqual(4); // 2 recordatorios × 2 cuidadores

      for (const id of [due, overdue]) {
        expect(await reminderStatus(id)).toBe('sent');
        for (const user of [caregiver, coCaregiver]) {
          expect(await notificationsFor(user.userId, id)).toEqual([
            { type: 'reminder_due', entity_type: 'reminder' },
          ]);
        }
      }
      expect(await reminderStatus(later)).toBe('pending');
      expect(await reminderStatus(done)).toBe('completed');
      expect(await notificationsFor(caregiver.userId, later)).toHaveLength(0);
      expect(await notificationsFor(caregiver.userId, done)).toHaveLength(0);

      // Segunda pasada: nada nuevo para este niño.
      await dispatchDueReminders();
      expect(await notificationsFor(caregiver.userId, due)).toHaveLength(1);

      // El cuidador ve el aviso por la API de notificaciones.
      const list = await request(app).get('/notifications').set('Authorization', caregiver.auth);
      expect(list.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'reminder_due', entityType: 'reminder', entityId: due }),
        ]),
      );
    });

    it('runRemindersJob devuelve el conteo y no lanza', async () => {
      const result = await runRemindersJob();
      expect(result).not.toBeNull();
      expect(result!.processed).toBeGreaterThanOrEqual(0);
    });
  });
});
