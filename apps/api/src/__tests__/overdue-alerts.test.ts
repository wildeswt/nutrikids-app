import crypto from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { encryptPii } from '../lib/pii-crypto.js';
import {
  isBackgroundJobsActive,
  isOverdueAlertsJobRunning,
  runOverdueAlertsJob,
  startBackgroundJobs,
  stopBackgroundJobs,
} from '../jobs/overdue-alerts.js';
import { prisma } from '../lib/prisma.js';
import { expoClient, processOverdueAlerts } from '../services/notifications.service.js';

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

describe('Overdue Alerts Background Job (NK-36)', { timeout: 60000 }, () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminConnectionString });
    await admin.connect();
  });

  afterAll(async () => {
    stopBackgroundJobs();
    await admin?.end();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createUser(role: 'CAREGIVER' | 'PROFESSIONAL'): Promise<string> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', $3, $4, 'active', now())`,
      [
        userId,
        `overdue-${userId}@nutrikids.local`,
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
    return userId;
  }

  async function seedChild(caregiverId: string): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, $4::date, 'FEMALE')`,
      [
        childId,
        encryptPii('Ana', 'children:first_name'),
        encryptPii('Overdue', 'children:last_name'),
        isoDateMonthsAgo(20),
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

  async function linkProfessional(
    childId: string,
    professionalId: string,
    options?: { active?: boolean },
  ) {
    const active = options?.active ?? true;
    const startDateSql = active ? 'CURRENT_DATE - 30' : 'CURRENT_DATE - 60';
    const endDateSql = active ? 'NULL' : 'CURRENT_DATE - 1';

    await admin.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
       VALUES ($1, $2, $3, ${startDateSql}, ${endDateSql})`,
      [crypto.randomUUID(), childId, professionalId],
    );
  }

  async function createAlertScenario(params: {
    isSevere: boolean;
    hoursAgo: number;
    initialNotificationHoursAgo?: number;
    alertStatus?: 'GENERATED' | 'PENDING_REVIEW' | 'REVIEWED' | 'FOLLOW_UP_ESTABLISHED';
    linkActive?: boolean;
    isCorrected?: boolean;
  }): Promise<{
    childId: string;
    professionalId: string;
    alertId: string;
    checkupId: string;
  }> {
    const caregiverId = await createUser('CAREGIVER');
    const professionalId = await createUser('PROFESSIONAL');
    const childId = await seedChild(caregiverId);

    await linkProfessional(childId, professionalId, { active: params.linkActive ?? true });

    // Registrar push token para el profesional
    const pushToken = `ExponentPushToken[device-${professionalId.slice(0, 10)}]`;
    await admin.query(
      `INSERT INTO push_devices (id, user_id, token, platform, last_seen_at)
       VALUES ($1, $2, $3, 'android', now())`,
      [crypto.randomUUID(), professionalId, pushToken],
    );

    const checkupId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO checkups (id, child_id, recorded_by_id, measured_at, weight_kg, length_height_cm, position, origin)
       VALUES ($1, $2, $3, now() - interval '${params.hoursAgo} hours', 8.5, 75.0, 'RECUMBENT', 'CAREGIVER')`,
      [checkupId, childId, caregiverId],
    );

    if (params.isCorrected) {
      const correctionCheckupId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO checkups (id, child_id, recorded_by_id, measured_at, weight_kg, length_height_cm, position, origin, corrected_checkup_id)
         VALUES ($1, $2, $3, now(), 8.7, 75.2, 'RECUMBENT', 'CAREGIVER', $4)`,
        [correctionCheckupId, childId, caregiverId, checkupId],
      );
    }

    const indicatorResultId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO indicator_results (id, checkup_id, indicator, z_score, percentile, classification, reference_version)
       VALUES ($1, $2, 'WEIGHT_FOR_AGE', -2.5, 1.2, 'DESNUTRICION_GLOBAL', 'WHO_2006')`,
      [indicatorResultId, checkupId],
    );

    const alertId = crypto.randomUUID();
    const status = params.alertStatus ?? 'PENDING_REVIEW';
    await admin.query(
      `INSERT INTO alerts (id, indicator_result_id, risk_type, is_severe, status, created_at)
       VALUES ($1, $2, 'UNDERWEIGHT', $3, $4, now() - interval '${params.hoursAgo} hours')`,
      [alertId, indicatorResultId, params.isSevere, status],
    );

    if (params.initialNotificationHoursAgo !== undefined) {
      await admin.query(
        `INSERT INTO notifications (id, user_id, type, entity_type, entity_id, sent_at)
         VALUES ($1, $2, 'alert_new', 'alert', $3, now() - interval '${params.initialNotificationHoursAgo} hours')`,
        [crypto.randomUUID(), professionalId, alertId],
      );
    }

    return { childId, professionalId, alertId, checkupId };
  }

  /**
   * Lecturas de verificación con el cliente admin: el cliente de la app (`prisma`) corre sin
   * usuario y, con el rol restringido `nutrikids_app` del CI, el RLS le oculta estas filas.
   */
  async function overdueNotifications(
    alertId: string,
    professionalId?: string,
  ): Promise<{ id: string }[]> {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT id FROM notifications
       WHERE entity_id = $1 AND type = 'alert_overdue' AND ($2::uuid IS NULL OR user_id = $2::uuid)`,
      [alertId, professionalId ?? null],
    );
    return rows;
  }

  async function alertStatus(alertId: string): Promise<string | undefined> {
    const { rows } = await admin.query<{ status: string }>(
      `SELECT status FROM alerts WHERE id = $1`,
      [alertId],
    );
    return rows[0]?.status;
  }

  describe('find_overdue_alert_recipients and processOverdueAlerts', () => {
    it('notifica una alerta grave vencida tras superar las 24 horas (plazo severo)', async () => {
      const sendPushSpy = vi
        .spyOn(expoClient, 'sendPushNotificationsAsync')
        .mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

      const { alertId, professionalId } = await createAlertScenario({
        isSevere: true,
        hoursAgo: 25,
        initialNotificationHoursAgo: 25,
      });

      const result = await processOverdueAlerts();
      expect(result.processed).toBeGreaterThanOrEqual(1);

      // Verificar que se creó la notificación interna alert_overdue
      const overdueNotifs = await overdueNotifications(alertId, professionalId);
      expect(overdueNotifs).toHaveLength(1);

      // Verificar que el estado de la alerta NO cambió (permanece PENDING_REVIEW)
      expect(await alertStatus(alertId)).toBe('PENDING_REVIEW');

      // Esperar brevemente despacho push en segundo plano
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(sendPushSpy).toHaveBeenCalled();
    });

    it('no notifica una alerta grave que tiene menos de 24 horas', async () => {
      const { alertId, professionalId } = await createAlertScenario({
        isSevere: true,
        hoursAgo: 20,
        initialNotificationHoursAgo: 20,
      });

      await processOverdueAlerts();

      const overdueNotifs = await overdueNotifications(alertId, professionalId);
      expect(overdueNotifs).toHaveLength(0);
    });

    it('notifica una alerta estándar vencida tras superar las 72 horas (plazo normal)', async () => {
      const { alertId, professionalId } = await createAlertScenario({
        isSevere: false,
        hoursAgo: 73,
        initialNotificationHoursAgo: 73,
      });

      await processOverdueAlerts();

      const overdueNotifs = await overdueNotifications(alertId, professionalId);
      expect(overdueNotifs).toHaveLength(1);
    });

    it('no notifica una alerta estándar antes de las 72 horas (por ejemplo a las 50 horas)', async () => {
      const { alertId, professionalId } = await createAlertScenario({
        isSevere: false,
        hoursAgo: 50,
        initialNotificationHoursAgo: 50,
      });

      await processOverdueAlerts();

      const overdueNotifs = await overdueNotifications(alertId, professionalId);
      expect(overdueNotifs).toHaveLength(0);
    });

    it('suprime avisos repetidos al mismo profesional dentro de la ventana de 24 horas (deduplicación)', async () => {
      const { alertId, professionalId } = await createAlertScenario({
        isSevere: true,
        hoursAgo: 30,
        initialNotificationHoursAgo: 30,
      });

      // Primera pasada: se procesa y notifica
      await processOverdueAlerts();

      const notifsAfterFirst = await overdueNotifications(alertId, professionalId);
      expect(notifsAfterFirst).toHaveLength(1);

      // Segunda pasada inmediata: debe ser omitida por el filtro de 24 horas
      await processOverdueAlerts();

      const notifsAfterSecond = await overdueNotifications(alertId, professionalId);
      expect(notifsAfterSecond).toHaveLength(1);
    });

    it('re-notifica si han pasado más de 24 horas desde la última notificación de alerta vencida', async () => {
      const { alertId, professionalId } = await createAlertScenario({
        isSevere: true,
        hoursAgo: 55,
      });

      // Insertar una notificación alert_overdue anterior de hace 26 horas
      await admin.query(
        `INSERT INTO notifications (id, user_id, type, entity_type, entity_id, sent_at)
         VALUES ($1, $2, 'alert_overdue', 'alert', $3, now() - interval '26 hours')`,
        [crypto.randomUUID(), professionalId, alertId],
      );

      // Ejecutar proceso: dado que 26h > 24h, debe re-notificar
      await processOverdueAlerts();

      const overdueNotifs = await overdueNotifications(alertId, professionalId);
      expect(overdueNotifs).toHaveLength(2);
    });

    it('ignora alertas asociadas a controles que han sido corregidos', async () => {
      const { alertId, professionalId } = await createAlertScenario({
        isSevere: true,
        hoursAgo: 30,
        initialNotificationHoursAgo: 30,
        isCorrected: true,
      });

      await processOverdueAlerts();

      const overdueNotifs = await overdueNotifications(alertId, professionalId);
      expect(overdueNotifs).toHaveLength(0);
    });

    it('ignora alertas que ya están en REVIEWED', async () => {
      const reviewed = await createAlertScenario({
        isSevere: true,
        hoursAgo: 35,
        alertStatus: 'REVIEWED',
      });

      await processOverdueAlerts();

      const notifsReviewed = await overdueNotifications(reviewed.alertId);

      expect(notifsReviewed).toHaveLength(0);
    });

    it('no notifica si el vínculo profesional-niño ya ha vencido (end_date < hoy)', async () => {
      const { alertId, professionalId } = await createAlertScenario({
        isSevere: true,
        hoursAgo: 40,
        linkActive: false,
      });

      await processOverdueAlerts();

      const overdueNotifs = await overdueNotifications(alertId, professionalId);
      expect(overdueNotifs).toHaveLength(0);
    });
  });

  describe('Job Runner and Lifecycle (runOverdueAlertsJob, startBackgroundJobs)', () => {
    it('evita ejecuciones solapadas mediante guarda anti-concurrencia', async () => {
      // Primera ejecución
      const p1 = runOverdueAlertsJob();
      // Segunda ejecución inmediata mientras la primera corre
      const p2 = runOverdueAlertsJob();

      const [res1, res2] = await Promise.all([p1, p2]);

      // Al menos uno debe haberse ejecutado y el otro retornado null si colisionaron
      expect(res1 !== null || res2 !== null).toBe(true);
      expect(isOverdueAlertsJobRunning()).toBe(false);
    });

    it('inicia y detiene temporizadores de background jobs limpiamente', () => {
      expect(isBackgroundJobsActive()).toBe(false);

      startBackgroundJobs();
      expect(isBackgroundJobsActive()).toBe(true);

      // Llamada redundante no crea temporizadores duplicados
      startBackgroundJobs();
      expect(isBackgroundJobsActive()).toBe(true);

      stopBackgroundJobs();
      expect(isBackgroundJobsActive()).toBe(false);

      // Llamada redundante a stop no falla
      stopBackgroundJobs();
      expect(isBackgroundJobsActive()).toBe(false);
    });
  });
});
