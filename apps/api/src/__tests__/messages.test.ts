import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma, withUser } from '../lib/prisma.js';
import { runErasureRequests } from '../services/dataRights.service.js';
import { signAccessToken } from '../services/token.service.js';

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

describe('Mensajes y derivaciones (NK-38)', { timeout: 60000 }, () => {
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

  async function createUser(
    role: 'CAREGIVER' | 'PROFESSIONAL',
    specialty: 'pediatrics' | 'nutrition' | 'nursing' = 'pediatrics',
  ): Promise<TestUser> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', 'Ana', $3, 'active', now())`,
      [userId, `msg-${userId}@nutrikids.local`, role === 'CAREGIVER' ? 'Cuidadora' : 'Doctora'],
    );
    if (role === 'CAREGIVER') {
      await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+593990000')`, [
        userId,
      ]);
    } else {
      await admin.query(
        `INSERT INTO professionals (user_id, specialty, license_number) VALUES ($1, $2, $3)`,
        [userId, specialty, `LIC-${userId.slice(0, 8)}`],
      );
    }
    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: [role],
      specialty: role === 'PROFESSIONAL' ? specialty : null,
    });
    return { userId, auth: `Bearer ${accessToken}` };
  }

  async function seedChild(caregiverId: string, withConsent = true): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, 'Mateo', 'Mensajes', CURRENT_DATE - 900, 'MALE')`,
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

  async function linkProfessional(childId: string, professionalId: string, ended = false) {
    await admin.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 30, CASE WHEN $4::boolean THEN CURRENT_DATE - 1 END)`,
      [crypto.randomUUID(), childId, professionalId, ended],
    );
  }

  function send(user: TestUser, childId: string, recipientId: string, body = 'Hola', id?: string) {
    return request(app)
      .post('/messages')
      .set('Authorization', user.auth)
      .send({ id: id ?? crypto.randomUUID(), childId, recipientId, body });
  }

  function refer(user: TestUser, childId: string, recipientId: string, body = 'Motivo') {
    return request(app)
      .post('/referrals')
      .set('Authorization', user.auth)
      .send({ id: crypto.randomUUID(), childId, recipientId, body });
  }

  async function waitForAudit(userId: string, entityId: string) {
    for (let i = 0; i < 30; i += 1) {
      const { rows } = await admin.query(
        `SELECT 1 FROM audit_logs WHERE user_id = $1 AND action = 'CREATE'
            AND entity_type = 'messages' AND entity_id = $2`,
        [userId, entityId],
      );
      if (rows.length > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  async function scenario() {
    const caregiver = await createUser('CAREGIVER');
    const pediatrician = await createUser('PROFESSIONAL', 'pediatrics');
    const nutritionist = await createUser('PROFESSIONAL', 'nutrition');
    const childId = await seedChild(caregiver.userId);
    await linkProfessional(childId, pediatrician.userId);
    await linkProfessional(childId, nutritionist.userId);
    return { caregiver, pediatrician, nutritionist, childId };
  }

  describe('POST /messages', () => {
    it('cuidador y profesional se escriben, es idempotente y se audita', async () => {
      const { caregiver, pediatrician, childId } = await scenario();
      const id = crypto.randomUUID();

      const first = await send(caregiver, childId, pediatrician.userId, '  Buenos días  ', id);
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        id,
        childId,
        senderId: caregiver.userId,
        recipientId: pediatrician.userId,
        kind: 'message',
        body: 'Buenos días',
        readAt: null,
      });

      const again = await send(caregiver, childId, pediatrician.userId, 'Buenos días', id);
      expect(again.status).toBe(200);
      expect(again.body.id).toBe(id);
      expect(
        (await admin.query(`SELECT count(*)::int AS n FROM messages WHERE id = $1`, [id])).rows[0]
          .n,
      ).toBe(1);

      const changed = await send(caregiver, childId, pediatrician.userId, 'Otro texto', id);
      expect(changed.status).toBe(409);

      const reply = await send(pediatrician, childId, caregiver.userId, 'Hola, dime');
      expect(reply.status).toBe(201);
      expect(await waitForAudit(caregiver.userId, id)).toBe(true);
    });

    it('crea una notificación message_new para el destinatario, una sola por mensaje', async () => {
      const { caregiver, pediatrician, childId } = await scenario();
      const id = crypto.randomUUID();
      await send(caregiver, childId, pediatrician.userId, 'Aviso', id);
      await send(caregiver, childId, pediatrician.userId, 'Aviso', id);

      const { rows } = await admin.query(
        `SELECT user_id, type, entity_type FROM notifications WHERE entity_id = $1`,
        [id],
      );
      expect(rows).toEqual([
        { user_id: pediatrician.userId, type: 'message_new', entity_type: 'message' },
      ]);

      const listed = await request(app)
        .get('/notifications')
        .set('Authorization', pediatrician.auth);
      expect(listed.body.some((n: { entityId: string }) => n.entityId === id)).toBe(true);
    });

    it('solo se escribe a personas vinculadas al niño', async () => {
      const { caregiver, pediatrician, childId } = await scenario();
      const stranger = await createUser('PROFESSIONAL');
      const otherCaregiver = await createUser('CAREGIVER');
      const coCaregiver = await createUser('CAREGIVER');
      await admin.query(
        `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
         VALUES ($1, $2, 'Padre', false)`,
        [coCaregiver.userId, childId],
      );

      // Destinatario sin vínculo con el niño
      expect((await send(caregiver, childId, stranger.userId)).status).toBe(403);
      expect((await send(caregiver, childId, otherCaregiver.userId)).status).toBe(403);
      // Remitente sin vínculo con el niño (también hacia quien sí lo tiene)
      expect((await send(stranger, childId, caregiver.userId)).status).toBe(403);
      expect((await send(otherCaregiver, childId, pediatrician.userId)).status).toBe(403);
      // Cuidador con cuidador no
      expect((await send(caregiver, childId, coCaregiver.userId)).status).toBe(403);
      // A uno mismo no
      expect((await send(caregiver, childId, caregiver.userId)).status).toBe(403);
      // Destinatario inexistente
      expect((await send(caregiver, childId, crypto.randomUUID())).status).toBe(403);

      expect(
        (
          await admin.query(`SELECT count(*)::int AS n FROM messages WHERE child_id = $1`, [
            childId,
          ])
        ).rows[0].n,
      ).toBe(0);
    });

    it('un vínculo profesional vencido ya no permite escribir', async () => {
      const caregiver = await createUser('CAREGIVER');
      const former = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId);
      await linkProfessional(childId, former.userId, true);

      expect((await send(caregiver, childId, former.userId)).status).toBe(403);
      expect((await send(former, childId, caregiver.userId)).status).toBe(403);
    });

    it('exige consentimiento vigente y valida la entrada', async () => {
      const caregiver = await createUser('CAREGIVER');
      const pro = await createUser('PROFESSIONAL');
      const childId = await seedChild(caregiver.userId, false);
      await linkProfessional(childId, pro.userId);

      expect((await send(caregiver, childId, pro.userId)).status).toBe(403);

      const { childId: okChild, caregiver: cg, pediatrician } = await scenario();
      expect((await send(cg, okChild, pediatrician.userId, '   ')).status).toBe(400);
      expect((await send(cg, okChild, pediatrician.userId, 'x'.repeat(2001))).status).toBe(400);
      const extra = await request(app).post('/messages').set('Authorization', cg.auth).send({
        id: crypto.randomUUID(),
        childId: okChild,
        recipientId: pediatrician.userId,
        body: 'hola',
        senderId: pediatrician.userId,
      });
      expect(extra.status).toBe(400);
      const unauth = await request(app).post('/messages').send({});
      expect(unauth.status).toBe(401);
    });

    it('el mismo id usado en una conversación ajena responde 409 sin revelar nada', async () => {
      const first = await scenario();
      const second = await scenario();
      const id = crypto.randomUUID();
      expect(
        (await send(first.caregiver, first.childId, first.pediatrician.userId, 'a', id)).status,
      ).toBe(201);
      const clash = await send(
        second.caregiver,
        second.childId,
        second.pediatrician.userId,
        'b',
        id,
      );
      expect(clash.status).toBe(409);
    });
  });

  describe('GET /messages y /messages/conversations', () => {
    it('lista el hilo paginado, privado y con conversaciones y no leídos', async () => {
      const { caregiver, pediatrician, nutritionist, childId } = await scenario();
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await send(caregiver, childId, pediatrician.userId, `Mensaje ${i}`);
        ids.push(res.body.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await send(pediatrician, childId, caregiver.userId, 'Respuesta');
      await send(caregiver, childId, nutritionist.userId, 'Para nutrición');

      const page1 = await request(app)
        .get('/messages')
        .query({ childId, withUserId: pediatrician.userId, limit: 4 })
        .set('Authorization', caregiver.auth);
      expect(page1.status).toBe(200);
      expect(page1.body.items.map((m: { body: string }) => m.body)).toEqual([
        'Respuesta',
        'Mensaje 4',
        'Mensaje 3',
        'Mensaje 2',
      ]);
      expect(page1.body.nextCursor).toBe(page1.body.items[3].id);

      const page2 = await request(app)
        .get('/messages')
        .query({
          childId,
          withUserId: pediatrician.userId,
          limit: 4,
          cursor: page1.body.nextCursor,
        })
        .set('Authorization', caregiver.auth);
      expect(page2.body.items.map((m: { body: string }) => m.body)).toEqual([
        'Mensaje 1',
        'Mensaje 0',
      ]);
      expect(page2.body.nextCursor).toBeNull();

      // El otro profesional no ve esta conversación; un extraño sin vínculo recibe 403.
      const spy = await request(app)
        .get('/messages')
        .query({ childId, withUserId: caregiver.userId })
        .set('Authorization', nutritionist.auth);
      expect(spy.status).toBe(200);
      expect(spy.body.items.map((m: { body: string }) => m.body)).toEqual(['Para nutrición']);
      const outsider = await createUser('PROFESSIONAL');
      const denied = await request(app)
        .get('/messages')
        .query({ childId, withUserId: caregiver.userId })
        .set('Authorization', outsider.auth);
      expect(denied.status).toBe(403);

      const conversations = await request(app)
        .get('/messages/conversations')
        .set('Authorization', caregiver.auth);
      expect(conversations.status).toBe(200);
      expect(conversations.body).toHaveLength(2);
      expect(conversations.body[0]).toMatchObject({
        childId,
        participant: {
          userId: nutritionist.userId,
          role: 'PROFESSIONAL',
          specialty: 'nutrition',
        },
        lastMessage: { body: 'Para nutrición' },
        unreadCount: 0,
      });
      expect(conversations.body[1]).toMatchObject({
        participant: { userId: pediatrician.userId, specialty: 'pediatrics' },
        lastMessage: { body: 'Respuesta' },
        unreadCount: 1,
      });

      const asPediatrician = await request(app)
        .get('/messages/conversations')
        .query({ childId })
        .set('Authorization', pediatrician.auth);
      expect(asPediatrician.body).toHaveLength(1);
      expect(asPediatrician.body[0]).toMatchObject({
        participant: { userId: caregiver.userId, role: 'CAREGIVER', specialty: null },
        unreadCount: 5,
      });
    });

    it('rechaza parámetros inválidos', async () => {
      const { caregiver } = await scenario();
      const res = await request(app)
        .get('/messages')
        .query({ childId: 'no-uuid', withUserId: "1' OR '1'='1", limit: 1000 })
        .set('Authorization', caregiver.auth);
      expect(res.status).toBe(400);
    });
  });

  describe('marcar como leído', () => {
    it('el destinatario marca un mensaje o todo el hilo; también sus notificaciones', async () => {
      const { caregiver, pediatrician, childId } = await scenario();
      const a = (await send(caregiver, childId, pediatrician.userId, 'uno')).body.id as string;
      const b = (await send(caregiver, childId, pediatrician.userId, 'dos')).body.id as string;
      const c = (await send(caregiver, childId, pediatrician.userId, 'tres')).body.id as string;

      // El remitente no puede marcar como leído lo que él mismo envió; un ajeno tampoco.
      expect(
        (await request(app).patch(`/messages/${a}/read`).set('Authorization', caregiver.auth))
          .status,
      ).toBe(404);
      const outsider = await createUser('PROFESSIONAL');
      expect(
        (await request(app).patch(`/messages/${a}/read`).set('Authorization', outsider.auth))
          .status,
      ).toBe(404);

      const one = await request(app)
        .patch(`/messages/${a}/read`)
        .set('Authorization', pediatrician.auth);
      expect(one.status).toBe(200);
      expect(one.body.readAt).not.toBeNull();
      const readAt = one.body.readAt;
      const repeat = await request(app)
        .patch(`/messages/${a}/read`)
        .set('Authorization', pediatrician.auth);
      expect(repeat.body.readAt).toBe(readAt);

      const thread = await request(app)
        .patch('/messages/read')
        .set('Authorization', pediatrician.auth)
        .send({ childId, withUserId: caregiver.userId });
      expect(thread.status).toBe(200);
      expect(thread.body).toEqual({ updated: 2 });
      const again = await request(app)
        .patch('/messages/read')
        .set('Authorization', pediatrician.auth)
        .send({ childId, withUserId: caregiver.userId });
      expect(again.body).toEqual({ updated: 0 });

      const { rows } = await admin.query(
        `SELECT entity_id, read_at FROM notifications WHERE entity_id = ANY($1::uuid[])`,
        [[a, b, c]],
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.read_at !== null)).toBe(true);

      const noLink = await request(app)
        .patch('/messages/read')
        .set('Authorization', outsider.auth)
        .send({ childId, withUserId: caregiver.userId });
      expect(noLink.status).toBe(403);
    });
  });

  describe('derivaciones', () => {
    it('un profesional deriva a otro profesional del mismo niño y ambos la ven', async () => {
      const { caregiver, pediatrician, nutritionist, childId } = await scenario();

      const created = await refer(pediatrician, childId, nutritionist.userId, 'Valorar dieta');
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        kind: 'referral',
        senderId: pediatrician.userId,
        recipientId: nutritionist.userId,
        body: 'Valorar dieta',
      });

      const { rows } = await admin.query(
        `SELECT user_id, type FROM notifications WHERE entity_id = $1`,
        [created.body.id],
      );
      expect(rows).toEqual([{ user_id: nutritionist.userId, type: 'referral_new' }]);

      const received = await request(app)
        .get('/referrals')
        .query({ box: 'received' })
        .set('Authorization', nutritionist.auth);
      expect(received.status).toBe(200);
      expect(received.body).toHaveLength(1);
      expect(received.body[0]).toMatchObject({
        id: created.body.id,
        sender: { userId: pediatrician.userId, specialty: 'pediatrics', role: 'PROFESSIONAL' },
        recipient: { userId: nutritionist.userId, specialty: 'nutrition' },
      });
      const sentByRecipient = await request(app)
        .get('/referrals')
        .query({ box: 'sent' })
        .set('Authorization', nutritionist.auth);
      expect(sentByRecipient.body).toHaveLength(0);
      const sent = await request(app).get('/referrals').set('Authorization', pediatrician.auth);
      expect(sent.body).toHaveLength(1);

      // El cuidador no ve la derivación ni puede usar el módulo de derivaciones.
      expect(
        (await request(app).get('/referrals').set('Authorization', caregiver.auth)).status,
      ).toBe(403);
      const caregiverThread = await request(app)
        .get('/messages')
        .query({ childId, withUserId: pediatrician.userId })
        .set('Authorization', caregiver.auth);
      expect(caregiverThread.body.items).toEqual([]);
      const caregiverConversations = await request(app)
        .get('/messages/conversations')
        .set('Authorization', caregiver.auth);
      expect(caregiverConversations.body).toEqual([]);

      // La derivación también aparece en el hilo entre profesionales y se puede responder.
      const reply = await send(nutritionist, childId, pediatrician.userId, 'Recibido');
      expect(reply.status).toBe(201);
      const thread = await request(app)
        .get('/messages')
        .query({ childId, withUserId: pediatrician.userId })
        .set('Authorization', nutritionist.auth);
      expect(thread.body.items.map((m: { kind: string }) => m.kind)).toEqual([
        'message',
        'referral',
      ]);

      // Idempotente por id.
      const id = crypto.randomUUID();
      const body = { id, childId, recipientId: nutritionist.userId, body: 'Otra' };
      expect(
        (await request(app).post('/referrals').set('Authorization', pediatrician.auth).send(body))
          .status,
      ).toBe(201);
      expect(
        (await request(app).post('/referrals').set('Authorization', pediatrician.auth).send(body))
          .status,
      ).toBe(200);
    });

    it('solo entre profesionales con vínculo vigente con el mismo niño', async () => {
      const { caregiver, pediatrician, childId } = await scenario();
      const unlinked = await createUser('PROFESSIONAL', 'nursing');
      const former = await createUser('PROFESSIONAL', 'nursing');
      await linkProfessional(childId, former.userId, true);

      expect((await refer(pediatrician, childId, unlinked.userId)).status).toBe(403);
      expect((await refer(pediatrician, childId, former.userId)).status).toBe(403);
      expect((await refer(pediatrician, childId, caregiver.userId)).status).toBe(403);
      expect((await refer(unlinked, childId, pediatrician.userId)).status).toBe(403);
      expect((await refer(caregiver, childId, pediatrician.userId)).status).toBe(403);
    });
  });

  describe('RLS e inmutabilidad con el rol restringido', () => {
    it('no se puede insertar a nombre de otro, editar ni borrar mensajes', async () => {
      const { caregiver, pediatrician, nutritionist, childId } = await scenario();
      const sent = await send(caregiver, childId, pediatrician.userId, 'Original');
      const id = sent.body.id as string;

      // Insertar con otro remitente o hacia alguien sin vínculo viola la política.
      await expect(
        withUser(caregiver.userId, (tx) =>
          tx.message.create({
            data: {
              senderId: pediatrician.userId,
              recipientId: caregiver.userId,
              childId,
              body: 'suplantado',
            },
          }),
        ),
      ).rejects.toThrow();
      const stranger = await createUser('PROFESSIONAL');
      await expect(
        withUser(caregiver.userId, (tx) =>
          tx.message.create({
            data: { senderId: caregiver.userId, recipientId: stranger.userId, childId, body: 'x' },
          }),
        ),
      ).rejects.toThrow();
      // Derivación hecha por un cuidador: la política lo impide aunque el endpoint se saltara.
      await expect(
        withUser(caregiver.userId, (tx) =>
          tx.message.create({
            data: {
              senderId: caregiver.userId,
              recipientId: pediatrician.userId,
              childId,
              kind: 'referral',
              body: 'x',
            },
          }),
        ),
      ).rejects.toThrow();

      // El texto no se puede editar ni por el remitente ni por el destinatario.
      await expect(
        withUser(
          caregiver.userId,
          (tx) => tx.$executeRaw`UPDATE messages SET body = 'editado' WHERE id = ${id}::uuid`,
        ),
      ).resolves.toBe(0);
      await expect(
        withUser(
          pediatrician.userId,
          (tx) => tx.$executeRaw`UPDATE messages SET body = 'editado' WHERE id = ${id}::uuid`,
        ),
      ).rejects.toThrow(/immutable/);
      // Solo se puede marcar como leído una vez.
      await withUser(
        pediatrician.userId,
        (tx) => tx.$executeRaw`UPDATE messages SET read_at = now() WHERE id = ${id}::uuid`,
      );
      await expect(
        withUser(
          pediatrician.userId,
          (tx) => tx.$executeRaw`UPDATE messages SET read_at = NULL WHERE id = ${id}::uuid`,
        ),
      ).rejects.toThrow(/immutable/);
      // Nadie borra desde la app.
      await expect(
        withUser(
          pediatrician.userId,
          (tx) => tx.$executeRaw`DELETE FROM messages WHERE id = ${id}::uuid`,
        ),
      ).rejects.toThrow();
      // Un tercero con vínculo no ve filas ajenas.
      const visible = await withUser(nutritionist.userId, (tx) =>
        tx.message.findMany({ where: { id } }),
      );
      expect(visible).toEqual([]);

      const { rows } = await admin.query(`SELECT body, read_at FROM messages WHERE id = $1`, [id]);
      expect(rows[0].body).toBe('Original');
      expect(rows[0].read_at).not.toBeNull();
    });

    it('al perder el acceso al niño, el mensaje deja de ser visible', async () => {
      const { caregiver, pediatrician, childId } = await scenario();
      const id = (await send(caregiver, childId, pediatrician.userId, 'Privado')).body.id as string;
      await admin.query(
        `UPDATE professional_children SET end_date = CURRENT_DATE - 1 WHERE child_id = $1 AND professional_id = $2`,
        [childId, pediatrician.userId],
      );
      const rows = await withUser(pediatrician.userId, (tx) =>
        tx.message.findMany({ where: { id } }),
      );
      expect(rows).toEqual([]);
    });
  });

  describe('eliminación de datos del niño (NK-41)', () => {
    it('al ejecutarse la solicitud se borran los mensajes del niño', async () => {
      const { caregiver, pediatrician, childId } = await scenario();
      await send(caregiver, childId, pediatrician.userId, 'Con datos de salud');
      await admin.query(
        `INSERT INTO erasure_requests (id, child_id, requested_by_id, status, requested_at, due_at)
         VALUES ($1, $2, $3, 'pending', now() - interval '3650 days', now())`,
        [crypto.randomUUID(), childId, caregiver.userId],
      );
      await runErasureRequests();
      expect(
        (
          await admin.query(`SELECT count(*)::int AS n FROM messages WHERE child_id = $1`, [
            childId,
          ])
        ).rows[0].n,
      ).toBe(0);
    });
  });
});
