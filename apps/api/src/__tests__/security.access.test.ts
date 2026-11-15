import crypto from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma, withUser } from '../lib/prisma.js';
import { decryptPii, encryptPii } from '../lib/pii-crypto.js';
import {
  connectAdmin,
  createUser,
  isoHoursAgo,
  linkProfessional,
  seedChild,
  type TestUser,
} from './helpers/world.js';

/**
 * Pruebas de seguridad de acceso (NK-46): un usuario sin vínculo no puede ver ni modificar a un
 * niño por ningún endpoint, y la base de datos lo impide aunque falle la aplicación (RLS con el
 * rol restringido `nutrikids_app`). Un fallo aquí es un defecto crítico que bloquea la entrega.
 */
describe('Seguridad: acceso por rol y vínculo (NK-46)', { timeout: 90000 }, () => {
  const app = createApp();
  let admin: pg.Client;

  let rep: TestUser;
  let nonRep: TestUser;
  let pro: TestUser;
  let stranger: TestUser;
  let unlinkedPro: TestUser;
  let expiredPro: TestUser;
  let childId: string;
  let strangerChildId: string;
  let checkupId: string;
  let alertId: string;
  let reminderId: string;
  let notificationId: string;

  beforeAll(async () => {
    admin = await connectAdmin();
    rep = await createUser(admin, 'CAREGIVER');
    nonRep = await createUser(admin, 'CAREGIVER');
    pro = await createUser(admin, 'PROFESSIONAL', 'pediatrics');
    stranger = await createUser(admin, 'CAREGIVER');
    unlinkedPro = await createUser(admin, 'PROFESSIONAL', 'pediatrics');
    expiredPro = await createUser(admin, 'PROFESSIONAL', 'pediatrics');

    childId = await seedChild(admin, rep.userId);
    strangerChildId = await seedChild(admin, stranger.userId);
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Tío', false)`,
      [nonRep.userId, childId],
    );
    await linkProfessional(admin, childId, pro.userId);
    await linkProfessional(admin, childId, expiredPro.userId, 'expired');

    checkupId = crypto.randomUUID();
    const checkup = await request(app)
      .post(`/children/${childId}/checkups`)
      .set('Authorization', rep.auth)
      .send({
        id: checkupId,
        measuredAt: isoHoursAgo(1),
        weightKg: 10,
        lengthHeightCm: 92,
        position: 'STANDING',
      });
    expect(checkup.status).toBe(201);
    const alert = await admin.query<{ id: string }>(
      `SELECT a.id FROM alerts a JOIN indicator_results ir ON ir.id = a.indicator_result_id
        WHERE ir.checkup_id = $1 LIMIT 1`,
      [checkupId],
    );
    alertId = alert.rows[0]!.id;

    await request(app)
      .post(`/children/${childId}/feeding-logs`)
      .set('Authorization', rep.auth)
      .send({
        id: crypto.randomUUID(),
        logDate: new Date().toISOString().slice(0, 10),
        mealsPerDay: 4,
      });
    await request(app)
      .post(`/children/${childId}/follow-ups`)
      .set('Authorization', pro.auth)
      .send({ id: crypto.randomUUID(), type: 'observation', details: 'Seguimiento sintético' });

    reminderId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO reminders (id, child_id, type, scheduled_for, status)
       VALUES ($1, $2, 'activity', now() + interval '5 days', 'pending')`,
      [reminderId, childId],
    );
    notificationId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO notifications (id, user_id, type, entity_type, entity_id)
       VALUES ($1, $2, 'reminder_due', 'reminder', $3)`,
      [notificationId, rep.userId, reminderId],
    );
  });

  afterAll(async () => {
    await admin?.end();
    await prisma.$disconnect();
  });

  type ActorKey = 'stranger' | 'unlinkedPro' | 'expiredPro' | 'nonRep' | 'pro' | 'rep';
  const actor = (key: ActorKey): TestUser =>
    ({ stranger, unlinkedPro, expiredPro, nonRep, pro, rep })[key];

  interface Endpoint {
    name: string;
    call: (token: string) => request.Test;
    denied: ActorKey[];
  }

  const OUTSIDERS: ActorKey[] = ['stranger', 'unlinkedPro', 'expiredPro'];
  const NOT_REPRESENTATIVE: ActorKey[] = [...OUTSIDERS, 'nonRep', 'pro'];
  const newId = () => crypto.randomUUID();

  const endpoints = (): Endpoint[] => [
    {
      name: 'GET /children/:id',
      call: (t) => request(app).get(`/children/${childId}`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'GET /children/:id/professionals',
      call: (t) => request(app).get(`/children/${childId}/professionals`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'GET /children/:id/caregivers',
      call: (t) => request(app).get(`/children/${childId}/caregivers`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'GET /children/:id/consent',
      call: (t) => request(app).get(`/children/${childId}/consent`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'GET /children/:id/checkups',
      call: (t) => request(app).get(`/children/${childId}/checkups`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'GET /children/:id/feeding-logs',
      call: (t) => request(app).get(`/children/${childId}/feeding-logs`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'GET /checkups/:id/results',
      call: (t) => request(app).get(`/checkups/${checkupId}/results`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'GET /alerts/:id',
      call: (t) => request(app).get(`/alerts/${alertId}`).set('Authorization', t),
      denied: [...OUTSIDERS, 'rep', 'nonRep'],
    },
    {
      name: 'POST /children/:id/checkups',
      call: (t) =>
        request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', t)
          .send({
            id: newId(),
            measuredAt: isoHoursAgo(1),
            weightKg: 13,
            lengthHeightCm: 93,
            position: 'STANDING',
          }),
      denied: OUTSIDERS,
    },
    {
      name: 'POST /checkups/:id/correction',
      call: (t) =>
        request(app)
          .post(`/checkups/${checkupId}/correction`)
          .set('Authorization', t)
          .send({
            id: newId(),
            measuredAt: isoHoursAgo(1),
            weightKg: 13,
            lengthHeightCm: 93,
            position: 'STANDING',
          }),
      denied: OUTSIDERS,
    },
    {
      name: 'POST /children/:id/feeding-logs',
      call: (t) =>
        request(app)
          .post(`/children/${childId}/feeding-logs`)
          .set('Authorization', t)
          .send({ id: newId(), logDate: '2026-01-02', mealsPerDay: 3 }),
      denied: OUTSIDERS,
    },
    {
      name: 'POST /children/:id/follow-ups',
      call: (t) =>
        request(app)
          .post(`/children/${childId}/follow-ups`)
          .set('Authorization', t)
          .send({ id: newId(), type: 'observation', details: 'x' }),
      denied: [...OUTSIDERS, 'rep', 'nonRep'],
    },
    {
      name: 'PATCH /alerts/:id/status',
      call: (t) =>
        request(app)
          .patch(`/alerts/${alertId}/status`)
          .set('Authorization', t)
          .send({ status: 'REVIEWED' }),
      denied: ['rep', 'nonRep', 'stranger', 'unlinkedPro', 'expiredPro'],
    },
    {
      name: 'POST /children/:id/professionals (auto-asignarse)',
      call: (t) =>
        request(app)
          .post(`/children/${childId}/professionals`)
          .set('Authorization', t)
          .send({ professionalId: unlinkedPro.userId }),
      denied: ['stranger', 'unlinkedPro', 'expiredPro', 'nonRep'],
    },
    {
      name: 'POST /children/:id/caregivers (auto-vincularse)',
      call: (t) =>
        request(app)
          .post(`/children/${childId}/caregivers`)
          .set('Authorization', t)
          .send({ caregiverId: stranger.userId, relationship: 'Intruso' }),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'PATCH /children/:id/caregivers/:cid',
      call: (t) =>
        request(app)
          .patch(`/children/${childId}/caregivers/${nonRep.userId}`)
          .set('Authorization', t)
          .send({ isLegalRepresentative: true }),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'DELETE /children/:id/caregivers/:cid',
      call: (t) =>
        request(app)
          .delete(`/children/${childId}/caregivers/${rep.userId}`)
          .set('Authorization', t),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'POST /children/:id/consent',
      call: (t) =>
        request(app)
          .post(`/children/${childId}/consent`)
          .set('Authorization', t)
          .send({ textVersion: 'v2' }),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'DELETE /children/:id/consent',
      call: (t) => request(app).delete(`/children/${childId}/consent`).set('Authorization', t),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'PATCH /children/:id (rectificar)',
      call: (t) =>
        request(app)
          .patch(`/children/${childId}`)
          .set('Authorization', t)
          .send({ firstName: 'Suplantado' }),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'GET /children/:id/export',
      call: (t) => request(app).get(`/children/${childId}/export`).set('Authorization', t),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'POST /children/:id/erasure-requests',
      call: (t) =>
        request(app).post(`/children/${childId}/erasure-requests`).set('Authorization', t),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'GET /children/:id/erasure-requests',
      call: (t) =>
        request(app).get(`/children/${childId}/erasure-requests`).set('Authorization', t),
      denied: NOT_REPRESENTATIVE,
    },
    {
      name: 'POST /reminders',
      call: (t) =>
        request(app)
          .post('/reminders')
          .set('Authorization', t)
          .send({
            id: newId(),
            childId,
            type: 'activity',
            scheduledFor: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          }),
      denied: OUTSIDERS,
    },
    {
      name: 'PATCH /reminders/:id/complete',
      call: (t) => request(app).patch(`/reminders/${reminderId}/complete`).set('Authorization', t),
      denied: OUTSIDERS,
    },
    {
      name: 'PATCH /notifications/:id/read (ajena)',
      call: (t) =>
        request(app).patch(`/notifications/${notificationId}/read`).set('Authorization', t),
      denied: ['stranger', 'unlinkedPro', 'expiredPro', 'nonRep', 'pro'],
    },
    {
      name: 'GET /audit',
      call: (t) => request(app).get('/audit').set('Authorization', t),
      denied: ['stranger', 'nonRep', 'rep'],
    },
  ];

  it('cada endpoint con datos de un niño rechaza a quien no tiene el vínculo o el rol (403/404)', async () => {
    const failures: string[] = [];
    for (const endpoint of endpoints()) {
      for (const key of endpoint.denied) {
        const res = await endpoint.call(actor(key).auth);
        if (![403, 404].includes(res.status)) {
          failures.push(`${endpoint.name} como ${key}: ${res.status} ${JSON.stringify(res.body)}`);
        }
        if (/Mateo|Sintetico|Suplantado/.test(JSON.stringify(res.body))) {
          failures.push(`${endpoint.name} como ${key} devolvió datos del niño`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('los accesos denegados no cambian nada en la base de datos', async () => {
    const child = await admin.query(`SELECT first_name, last_name FROM children WHERE id = $1`, [
      childId,
    ]);
    expect(decryptPii(child.rows[0].first_name, 'children:first_name')).toBe('Mateo');
    expect(decryptPii(child.rows[0].last_name, 'children:last_name')).toBe('Sintetico');
    const consent = await admin.query(
      `SELECT count(*)::int AS n FROM consents WHERE child_id = $1 AND revoked_at IS NULL`,
      [childId],
    );
    expect(consent.rows[0].n).toBe(1);
    const links = await admin.query(
      `SELECT count(*)::int AS n FROM caregiver_children WHERE child_id = $1`,
      [childId],
    );
    expect(links.rows[0].n).toBe(2);
    const professionals = await admin.query(
      `SELECT count(*)::int AS n FROM professional_children WHERE child_id = $1`,
      [childId],
    );
    expect(professionals.rows[0].n).toBe(2);
    const erasures = await admin.query(
      `SELECT count(*)::int AS n FROM erasure_requests WHERE child_id = $1`,
      [childId],
    );
    expect(erasures.rows[0].n).toBe(0);
    const alert = await admin.query(`SELECT status FROM alerts WHERE id = $1`, [alertId]);
    expect(alert.rows[0].status).toBe('PENDING_REVIEW');
    const reminder = await admin.query(`SELECT status FROM reminders WHERE id = $1`, [reminderId]);
    expect(reminder.rows[0].status).toBe('pending');
    const notification = await admin.query(`SELECT read_at FROM notifications WHERE id = $1`, [
      notificationId,
    ]);
    expect(notification.rows[0].read_at).toBeNull();
    const checkups = await admin.query(
      `SELECT count(*)::int AS n FROM checkups WHERE child_id = $1`,
      [childId],
    );
    expect(checkups.rows[0].n).toBe(1);
  });

  it('los listados no filtran niños ajenos', async () => {
    for (const who of [stranger, unlinkedPro, expiredPro]) {
      const children = await request(app).get('/children').set('Authorization', who.auth);
      expect(JSON.stringify(children.body)).not.toContain(childId);

      const reminders = await request(app)
        .get('/reminders')
        .query({ childId })
        .set('Authorization', who.auth);
      expect(reminders.body).toEqual([]);

      const notifications = await request(app).get('/notifications').set('Authorization', who.auth);
      expect(JSON.stringify(notifications.body)).not.toContain(notificationId);
    }
    for (const who of [unlinkedPro, expiredPro]) {
      const alerts = await request(app).get('/alerts').set('Authorization', who.auth);
      expect(JSON.stringify(alerts.body)).not.toContain(childId);
    }
    const mine = await request(app).get('/children').set('Authorization', stranger.auth);
    expect(JSON.stringify(mine.body)).toContain(strangerChildId);
  });

  it('la sincronización sin conexión no permite escribir en el niño de otro', async () => {
    const id = crypto.randomUUID();
    const res = await request(app)
      .post('/sync/checkups')
      .set('Authorization', stranger.auth)
      .send({
        checkups: [
          {
            id,
            childId,
            measuredAt: isoHoursAgo(1),
            weightKg: 12,
            lengthHeightCm: 92,
            position: 'STANDING',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/CREATED/);
    const stored = await admin.query(`SELECT count(*)::int AS n FROM checkups WHERE id = $1`, [id]);
    expect(stored.rows[0].n).toBe(0);
  });

  it('los controles positivos funcionan: el vínculo correcto sí accede (la prueba no es vacía)', async () => {
    for (const path of [
      `/children/${childId}`,
      `/children/${childId}/checkups`,
      `/children/${childId}/consent`,
      `/checkups/${checkupId}/results`,
    ]) {
      for (const who of [rep, nonRep, pro]) {
        const res = await request(app).get(path).set('Authorization', who.auth);
        expect(res.status, `${path} como ${who.userId}`).toBe(200);
      }
    }
    expect(
      (await request(app).get(`/children/${childId}/export`).set('Authorization', rep.auth)).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/alerts/${alertId}`).set('Authorization', pro.auth)).status,
    ).toBe(200);
  });

  describe('Row Level Security con el rol restringido nutrikids_app', () => {
    const CHILD_TABLES = [
      'consents',
      'checkups',
      'feeding_logs',
      'follow_ups',
      'reminders',
      'caregiver_children',
      'professional_children',
    ];

    /** Filas del niño visibles al usuario; `excludeOwn` ignora su propia asignación (un profesional siempre ve la suya). */
    async function visibleRows(userId: string, table: string, excludeOwn = false): Promise<number> {
      const own = excludeOwn && table === 'professional_children';
      const sql = `SELECT count(*)::int AS n FROM ${table} WHERE child_id = $1::uuid${
        own ? ' AND professional_id <> $2::uuid' : ''
      }`;
      const rows = await withUser(userId, (tx) =>
        tx.$queryRawUnsafe<{ n: number }[]>(sql, ...(own ? [childId, userId] : [childId])),
      );
      return rows[0]!.n;
    }

    it('un usuario sin vínculo no ve ninguna fila del niño, ni directa ni indirecta', async () => {
      for (const who of [stranger, unlinkedPro, expiredPro]) {
        for (const table of CHILD_TABLES) {
          expect(
            await visibleRows(who.userId, table, true),
            `${table} visible a ${who.userId}`,
          ).toBe(0);
        }
        const indirect = await withUser(who.userId, async (tx) => ({
          children: await tx.child.count({ where: { id: childId } }),
          results: await tx.indicatorResult.count({ where: { checkupId } }),
          alerts: await tx.alert.count({ where: { id: alertId } }),
          history: await tx.alertHistory.count({ where: { alertId } }),
        }));
        expect(indirect).toEqual({ children: 0, results: 0, alerts: 0, history: 0 });
      }
      // Los vinculados sí las ven
      for (const table of CHILD_TABLES) {
        expect(await visibleRows(rep.userId, table)).toBeGreaterThan(0);
      }
      expect(await visibleRows(pro.userId, 'checkups')).toBe(1);
    });

    it('un usuario sin vínculo no puede escribir en datos del niño', async () => {
      await expect(
        withUser(stranger.userId, (tx) =>
          tx.checkup.create({
            data: {
              id: crypto.randomUUID(),
              childId,
              measuredAt: new Date(),
              weightKg: 12,
              lengthHeightCm: 92,
              position: 'STANDING',
              origin: 'CAREGIVER',
              recordedById: stranger.userId,
            },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        withUser(stranger.userId, (tx) =>
          tx.consent.create({
            data: { childId, caregiverId: stranger.userId, textVersion: 'falso' },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        withUser(stranger.userId, (tx) =>
          tx.reminder.create({
            data: {
              childId,
              type: 'activity',
              scheduledFor: new Date(Date.now() + 86_400_000),
              status: 'pending',
            },
          }),
        ),
      ).rejects.toThrow();

      const updated = await withUser(stranger.userId, async (tx) => ({
        child: await tx.child.updateMany({ where: { id: childId }, data: { firstNameEnc: 'X' } }),
        consent: await tx.consent.updateMany({
          where: { childId },
          data: { revokedAt: new Date() },
        }),
        reminders: await tx.reminder.updateMany({
          where: { childId },
          data: { status: 'completed' },
        }),
        notifications: await tx.notification.updateMany({
          where: { id: notificationId },
          data: { readAt: new Date() },
        }),
      }));
      expect(updated.child.count).toBe(0);
      expect(updated.consent.count).toBe(0);
      expect(updated.reminders.count).toBe(0);
      expect(updated.notifications.count).toBe(0);

      const deleted = await withUser(stranger.userId, async (tx) => ({
        links: await tx.caregiverChild.deleteMany({ where: { childId } }),
        feeding: await tx.feedingLog.deleteMany({ where: { childId } }),
      }));
      expect(deleted.links.count).toBe(0);
      expect(deleted.feeding.count).toBe(0);

      const child = await admin.query(`SELECT first_name FROM children WHERE id = $1`, [childId]);
      expect(decryptPii(child.rows[0].first_name, 'children:first_name')).toBe('Mateo');
    });

    it('nadie puede vincularse a sí mismo a un niño existente (defecto corregido en 20261114170000)', async () => {
      // Cuidador sin vínculo se agrega como cuidador del niño
      await expect(
        withUser(stranger.userId, (tx) =>
          tx.caregiverChild.create({
            data: { childId, caregiverId: stranger.userId, relationship: 'Intruso' },
          }),
        ),
      ).rejects.toThrow();
      // Profesional sin vínculo se asigna a sí mismo
      await expect(
        withUser(unlinkedPro.userId, (tx) =>
          tx.professionalChild.create({
            data: { childId, professionalId: unlinkedPro.userId, startDate: new Date() },
          }),
        ),
      ).rejects.toThrow();
      // Profesional con vínculo vencido vuelve a asignarse
      await expect(
        withUser(expiredPro.userId, (tx) =>
          tx.professionalChild.create({
            data: { childId, professionalId: expiredPro.userId, startDate: new Date() },
          }),
        ),
      ).rejects.toThrow();
      // ... o reabre su vínculo vencido quitándole la fecha de fin
      const reopened = await withUser(expiredPro.userId, (tx) =>
        tx.professionalChild
          .updateMany({
            where: { childId, professionalId: expiredPro.userId },
            data: { endDate: null },
          })
          .catch(() => 'rejected'),
      );
      expect(typeof reopened === 'string' || reopened.count === 0).toBe(true);

      const stillExpired = await admin.query(
        `SELECT end_date IS NOT NULL AS closed FROM professional_children
          WHERE child_id = $1 AND professional_id = $2`,
        [childId, expiredPro.userId],
      );
      expect(stillExpired.rows).toEqual([{ closed: true }]);
      const selfLinks = await admin.query(
        `SELECT count(*)::int AS n FROM caregiver_children WHERE child_id = $1 AND caregiver_id = $2`,
        [childId, stranger.userId],
      );
      expect(selfLinks.rows[0].n).toBe(0);
    });

    it('el alta de un niño nuevo y el cierre del propio vínculo profesional siguen funcionando', async () => {
      // Alta de un niño nuevo: vínculo primero (FK diferida), niño después
      const newChild = crypto.randomUUID();
      await withUser(stranger.userId, async (tx) => {
        await tx.caregiverChild.create({
          data: {
            childId: newChild,
            caregiverId: stranger.userId,
            relationship: 'Madre',
            isLegalRepresentative: true,
          },
        });
        await tx.child.create({
          data: {
            id: newChild,
            firstNameEnc: encryptPii('Lucia', 'children:first_name'),
            lastNameEnc: encryptPii('Sintetica', 'children:last_name'),
            birthDate: new Date(Date.now() - 800 * 86_400_000),
            sex: 'FEMALE',
          },
        });
      });
      expect(
        await withUser(stranger.userId, (tx) => tx.child.count({ where: { id: newChild } })),
      ).toBe(1);

      // Un profesional asignado termina su propio vínculo y deja de ver al niño
      const leaving = await createUser(admin, 'PROFESSIONAL');
      await linkProfessional(admin, childId, leaving.userId);
      expect(
        await withUser(leaving.userId, (tx) => tx.child.count({ where: { id: childId } })),
      ).toBe(1);
      const closed = await withUser(leaving.userId, (tx) =>
        tx.professionalChild.updateMany({
          where: { childId, professionalId: leaving.userId },
          data: { endDate: new Date(Date.now() - 2 * 86_400_000) },
        }),
      );
      expect(closed.count).toBe(1);
      expect(
        await withUser(leaving.userId, (tx) => tx.child.count({ where: { id: childId } })),
      ).toBe(0);
    });

    it('el rol de la aplicación no es superusuario, no omite RLS y no puede cambiar el esquema', async () => {
      const role = await withUser(
        rep.userId,
        (tx) =>
          tx.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean }[]>`
          SELECT rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = current_user
        `,
      );
      expect(role[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false });

      for (const statement of [
        'ALTER TABLE checkups DISABLE ROW LEVEL SECURITY',
        'DROP TABLE feeding_logs',
        'DROP POLICY child_access ON checkups',
        'ALTER TABLE checkups DISABLE TRIGGER checkups_immutable',
        'TRUNCATE checkups',
        'SELECT * FROM _prisma_migrations',
      ]) {
        await expect(
          withUser(rep.userId, (tx) => tx.$executeRawUnsafe(statement)),
          statement,
        ).rejects.toThrow();
      }

      const rls = await admin.query(
        `SELECT relname FROM pg_class
          WHERE relname = ANY($1::text[]) AND NOT relrowsecurity`,
        [[...CHILD_TABLES, 'children', 'notifications', 'messages', 'alerts', 'alert_history']],
      );
      expect(rls.rows.map((r) => r.relname)).toEqual([]);
    });
  });
});
