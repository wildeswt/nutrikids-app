import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { dispatchExpoPush, expoClient } from '../services/notifications.service.js';
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

describe('Notifications API (/notifications) and Push Pipeline', { timeout: 60000 }, () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
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
      [userId, `notif-${userId}@nutrikids.local`],
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
       VALUES ($1, 'Mateo', 'Notif', $2::date, 'MALE')`,
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

  async function linkProfessional(childId: string, professionalId: string) {
    await admin.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 30, NULL)`,
      [crypto.randomUUID(), childId, professionalId],
    );
  }

  describe('Device token registration and deletion', () => {
    it('registra un dispositivo push y permite actualizarlo (upsert)', async () => {
      const user1 = await createUser('PROFESSIONAL');
      const user2 = await createUser('PROFESSIONAL');
      const pushToken = 'ExponentPushToken[test-device-token-12345]';

      // Registro inicial para user1
      const res1 = await request(app)
        .post('/notifications/devices')
        .set('Authorization', user1.token)
        .send({ token: pushToken, platform: 'android' });

      expect(res1.status).toBe(200);
      expect(res1.body.userId).toBe(user1.userId);
      expect(res1.body.platform).toBe('android');

      // Reasignación del mismo token a user2 (por ejemplo cambio de cuenta en el teléfono)
      const res2 = await request(app)
        .post('/notifications/devices')
        .set('Authorization', user2.token)
        .send({ token: pushToken, platform: 'android' });

      expect(res2.status).toBe(200);
      expect(res2.body.userId).toBe(user2.userId);

      // Verificación en BD
      const dev = await prisma.pushDevice.findUnique({ where: { token: pushToken } });
      expect(dev?.userId).toBe(user2.userId);

      // Eliminación por logout de user2
      const delRes = await request(app)
        .delete(`/notifications/devices/${encodeURIComponent(pushToken)}`)
        .set('Authorization', user2.token);

      expect(delRes.status).toBe(204);

      const remaining = await prisma.pushDevice.findUnique({ where: { token: pushToken } });
      expect(remaining).toBeNull();
    });

    it('no elimina un token perteneciente a otro usuario', async () => {
      const user1 = await createUser('PROFESSIONAL');
      const user2 = await createUser('PROFESSIONAL');
      const pushToken = 'ExponentPushToken[test-device-token-isolation]';

      await request(app)
        .post('/notifications/devices')
        .set('Authorization', user1.token)
        .send({ token: pushToken, platform: 'ios' });

      // user2 intenta eliminar el token de user1
      const delRes = await request(app)
        .delete(`/notifications/devices/${encodeURIComponent(pushToken)}`)
        .set('Authorization', user2.token);

      expect(delRes.status).toBe(204);

      // El token sigue perteneciendo a user1
      const stillThere = await prisma.pushDevice.findUnique({ where: { token: pushToken } });
      expect(stillThere?.userId).toBe(user1.userId);
    });
  });

  describe('Notifications inbox and mark as read', () => {
    it('lista notificaciones propias y las marca como leídas bajo RLS', async () => {
      const user = await createUser('PROFESSIONAL');
      const otherUser = await createUser('PROFESSIONAL');

      const notifId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO notifications (id, user_id, type, entity_type, entity_id, sent_at)
         VALUES ($1, $2, 'alert_new', 'alert', $3, now())`,
        [notifId, user.userId, crypto.randomUUID()],
      );

      // GET /notifications
      const listRes = await request(app).get('/notifications').set('Authorization', user.token);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(notifId);
      expect(listRes.body[0].readAt).toBeNull();

      // otherUser no ve la notificación
      const otherList = await request(app)
        .get('/notifications')
        .set('Authorization', otherUser.token);
      expect(otherList.status).toBe(200);
      expect(otherList.body).toEqual([]);

      // PATCH /notifications/:id/read por otherUser -> 404
      const otherPatch = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set('Authorization', otherUser.token);
      expect(otherPatch.status).toBe(404);

      // PATCH /notifications/:id/read por propietario -> 200
      const patchRes = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set('Authorization', user.token);
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.readAt).not.toBeNull();

      // Segunda llamada idempotente
      const patchAgain = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set('Authorization', user.token);
      expect(patchAgain.status).toBe(200);
      expect(patchAgain.body.readAt).toBe(patchRes.body.readAt);
    });
  });

  describe('Full alert creation -> notification & push pipeline', () => {
    it('un cuidador registra un control con riesgo: crea Notification para profesional vinculado, pasa alerta a PENDING_REVIEW y envía push genérico', async () => {
      const caregiver = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId);
      await linkProfessional(childId, professional.userId);

      const pushToken = 'ExponentPushToken[valid-expo-token-mocked-1234]';
      await request(app)
        .post('/notifications/devices')
        .set('Authorization', professional.token)
        .send({ token: pushToken, platform: 'android' });

      const sendPushSpy = vi
        .spyOn(expoClient, 'sendPushNotificationsAsync')
        .mockResolvedValueOnce([{ status: 'ok', id: 'receipt-1' }]);

      const checkupId = crypto.randomUUID();
      // Registro de control con riesgo de desnutrición aguda (9kg en niño de 30m, 90cm)
      const res = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send({
          id: checkupId,
          measuredAt: new Date().toISOString(),
          weightKg: 9,
          lengthHeightCm: 90,
          position: 'STANDING',
        });

      expect(res.status).toBe(201);

      // Esperar brevemente a que el despacho en segundo plano invoque a Expo
      for (let i = 0; i < 30 && sendPushSpy.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Verificar que el profesional tiene la notificación interna
      const notifRes = await request(app)
        .get('/notifications')
        .set('Authorization', professional.token);

      expect(notifRes.status).toBe(200);
      expect(notifRes.body.length).toBeGreaterThanOrEqual(1);
      const alertNotif = notifRes.body.find((n: { type: string }) => n.type === 'alert_new');
      expect(alertNotif).toBeDefined();
      expect(alertNotif.entityType).toBe('alert');

      // Verificar que la alerta pasó a PENDING_REVIEW en base de datos
      const alert = await prisma.alert.findUnique({
        where: { id: alertNotif.entityId },
      });
      expect(alert?.status).toBe('PENDING_REVIEW');

      // Verificar que alert_history tiene la transición
      const history = await prisma.alertHistory.findMany({
        where: { alertId: alertNotif.entityId },
      });
      expect(history.some((h) => h.status === 'PENDING_REVIEW')).toBe(true);

      // Verificar que se invocó el envío push con cuerpo genérico sin datos confidenciales
      expect(sendPushSpy).toHaveBeenCalledTimes(1);
      const pushCallArgs = sendPushSpy.mock.calls[0]?.[0];
      expect(pushCallArgs).toBeDefined();
      expect(pushCallArgs?.[0]?.to).toBe(pushToken);
      expect(pushCallArgs?.[0]?.title).toBe('NutriKids');
      expect(pushCallArgs?.[0]?.body).toBe('Tienes una alerta pendiente de revisión');
      // No contiene nombres del niño ni valores z
      expect(pushCallArgs?.[0]?.body).not.toContain('Mateo');
      expect(pushCallArgs?.[0]?.body).not.toContain('-4');
    });

    it('elimina automáticamente el token de push si Expo responde DeviceNotRegistered', async () => {
      const caregiver = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId);
      await linkProfessional(childId, professional.userId);

      const invalidToken = 'ExponentPushToken[unregistered-device-token]';
      await request(app)
        .post('/notifications/devices')
        .set('Authorization', professional.token)
        .send({ token: invalidToken, platform: 'android' });

      vi.spyOn(expoClient, 'sendPushNotificationsAsync').mockResolvedValueOnce([
        {
          status: 'error',
          message: 'DeviceNotRegistered',
          details: { error: 'DeviceNotRegistered', expoPushToken: invalidToken },
        },
      ]);

      const checkupId = crypto.randomUUID();
      await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', caregiver.token)
        .send({
          id: checkupId,
          measuredAt: new Date().toISOString(),
          weightKg: 9,
          lengthHeightCm: 90,
          position: 'STANDING',
        });

      // Esperar a que el despacho en segundo plano complete la limpieza del token
      let dev = await prisma.pushDevice.findUnique({ where: { token: invalidToken } });
      for (let i = 0; i < 40 && dev !== null; i++) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        dev = await prisma.pushDevice.findUnique({ where: { token: invalidToken } });
      }
      expect(dev).toBeNull();
    });

    it('dispatchExpoPush procesa tickets y borra tokens no registrados directamente', async () => {
      const user = await createUser('PROFESSIONAL');
      const badToken = 'ExponentPushToken[direct-bad-token-test]';
      await prisma.pushDevice.create({
        data: { userId: user.userId, token: badToken, platform: 'android' },
      });

      vi.spyOn(expoClient, 'sendPushNotificationsAsync').mockResolvedValueOnce([
        {
          status: 'error',
          message: 'DeviceNotRegistered',
          details: { error: 'DeviceNotRegistered', expoPushToken: badToken },
        },
      ]);

      await dispatchExpoPush([{ to: badToken, title: 'Test', body: 'Test push' }]);

      const found = await prisma.pushDevice.findUnique({ where: { token: badToken } });
      expect(found).toBeNull();
    });

    it('sincronización idempotente (syncCheckups) no vuelve a notificar en un reenvío DUPLICATE', async () => {
      const caregiver = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId);
      await linkProfessional(childId, professional.userId);

      const syncPushToken = 'ExponentPushToken[sync-test-device-token]';
      await request(app)
        .post('/notifications/devices')
        .set('Authorization', professional.token)
        .send({ token: syncPushToken, platform: 'android' });

      const sendPushSpy = vi
        .spyOn(expoClient, 'sendPushNotificationsAsync')
        .mockResolvedValue([{ status: 'ok', id: 'receipt-sync' }]);

      const checkupId = crypto.randomUUID();
      const payload = {
        checkups: [
          {
            id: checkupId,
            childId,
            measuredAt: new Date().toISOString(),
            weightKg: 9,
            lengthHeightCm: 90,
            position: 'STANDING',
          },
        ],
      };

      // Primer sync -> CREATED
      const res1 = await request(app)
        .post('/sync/checkups')
        .set('Authorization', caregiver.token)
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.results[0].status).toBe('CREATED');

      for (let i = 0; i < 30 && sendPushSpy.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(sendPushSpy).toHaveBeenCalledTimes(1);

      const notifsFirst = await request(app)
        .get('/notifications')
        .set('Authorization', professional.token);
      const countAfterFirst = notifsFirst.body.length;
      expect(countAfterFirst).toBeGreaterThanOrEqual(1);

      // Reenvío idempotente -> DUPLICATE
      const res2 = await request(app)
        .post('/sync/checkups')
        .set('Authorization', caregiver.token)
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body.results[0].status).toBe('DUPLICATE');

      await new Promise((resolve) => setTimeout(resolve, 80));
      const notifsSecond = await request(app)
        .get('/notifications')
        .set('Authorization', professional.token);

      // No se generaron notificaciones duplicadas ni pushes adicionales
      expect(notifsSecond.body.length).toBe(countAfterFirst);
      expect(sendPushSpy).toHaveBeenCalledTimes(1);
    });

    it('un profesional que registra un control no recibe auto-notificación de su propia alerta', async () => {
      const caregiver = await createUser('CAREGIVER');
      const professional = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId);
      await linkProfessional(childId, professional.userId);

      const sendPushSpy = vi
        .spyOn(expoClient, 'sendPushNotificationsAsync')
        .mockResolvedValue([{ status: 'ok', id: 'receipt-self' }]);

      const checkupId = crypto.randomUUID();
      const res = await request(app)
        .post(`/children/${childId}/checkups`)
        .set('Authorization', professional.token)
        .send({
          id: checkupId,
          measuredAt: new Date().toISOString(),
          weightKg: 9,
          lengthHeightCm: 90,
          position: 'STANDING',
        });

      expect(res.status).toBe(201);

      await new Promise((resolve) => setTimeout(resolve, 80));

      const notifRes = await request(app)
        .get('/notifications')
        .set('Authorization', professional.token);

      expect(notifRes.body).toEqual([]);
      expect(sendPushSpy).not.toHaveBeenCalled();

      const alerts = await prisma.alert.findMany({
        where: { indicatorResult: { checkupId } },
      });
      expect(alerts.every((a) => a.status === 'GENERATED')).toBe(true);
    });
  });
});
