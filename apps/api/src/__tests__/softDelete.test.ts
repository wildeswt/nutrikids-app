import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { encryptPii } from '../lib/pii-crypto.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../services/token.service.js';

describe('Eliminación lógica de controles y niños', { timeout: 60000 }, () => {
  const app = createApp();
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL });
    await admin.connect();
  });

  afterAll(async () => {
    await admin?.end();
    await prisma.$disconnect();
  });

  async function createCaregiver(): Promise<{ userId: string; auth: string }> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'secret-hash', $3, $4, 'active', now())`,
      [
        userId,
        `softdel-${userId}@nutrikids.local`,
        encryptPii('Ana', 'users:first_name'),
        encryptPii('Rep', 'users:last_name'),
      ],
    );
    await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, $2)`, [
      userId,
      encryptPii('+593990000', 'caregivers:phone'),
    ]);
    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: ['CAREGIVER'],
      specialty: null,
    });
    return { userId, auth: `Bearer ${accessToken}` };
  }

  async function seedChild(rep: { userId: string }, legal = true) {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, CURRENT_DATE - 900, 'MALE')`,
      [childId, encryptPii('Mateo', 'children:first_name'), encryptPii('R', 'children:last_name')],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', $3)`,
      [rep.userId, childId, legal],
    );
    await admin.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, rep.userId],
    );
    return childId;
  }

  async function seedCheckup(childId: string, recordedBy: string, corrects?: string) {
    const id = crypto.randomUUID();
    await admin.query(
      `INSERT INTO checkups (id, child_id, measured_at, weight_kg, length_height_cm, position, origin, recorded_by_id, corrected_checkup_id)
       VALUES ($1, $2, now() - interval '1 hour', 12.0, 85.0, 'STANDING', 'CAREGIVER', $3, $4)`,
      [id, childId, recordedBy, corrects ?? null],
    );
    return id;
  }

  const listIds = async (auth: string, childId: string) => {
    const res = await request(app).get(`/children/${childId}/checkups`).set('Authorization', auth);
    expect(res.status).toBe(200);
    return (res.body as Array<{ id: string }>).map((c) => c.id);
  };

  it('DELETE /checkups/:id oculta el control pero la fila queda en la base', async () => {
    const rep = await createCaregiver();
    const childId = await seedChild(rep);
    const keep = await seedCheckup(childId, rep.userId);
    const gone = await seedCheckup(childId, rep.userId);

    const res = await request(app).delete(`/checkups/${gone}`).set('Authorization', rep.auth);
    expect(res.status).toBe(204);

    expect(await listIds(rep.auth, childId)).toEqual([keep]);
    const { rows } = await admin.query(
      `SELECT deleted_at, deleted_by_id FROM checkups WHERE id = $1`,
      [gone],
    );
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].deleted_by_id).toBe(rep.userId);

    // Ya no existe para la app.
    const again = await request(app).delete(`/checkups/${gone}`).set('Authorization', rep.auth);
    expect(again.status).toBe(404);
  });

  it('al eliminar una corrección, el control original vuelve a ser el vigente', async () => {
    const rep = await createCaregiver();
    const childId = await seedChild(rep);
    const original = await seedCheckup(childId, rep.userId);
    const correction = await seedCheckup(childId, rep.userId, original);

    const before = await request(app)
      .get(`/children/${childId}/checkups`)
      .set('Authorization', rep.auth);
    const current = (before.body as Array<{ id: string; isCurrent: boolean }>).filter(
      (c) => c.isCurrent,
    );
    expect(current.map((c) => c.id)).toEqual([correction]);

    await request(app).delete(`/checkups/${correction}`).set('Authorization', rep.auth);

    const after = await request(app)
      .get(`/children/${childId}/checkups`)
      .set('Authorization', rep.auth);
    expect(after.body).toMatchObject([{ id: original, isCurrent: true }]);
  });

  it('un cuidador que no registró el control ni es representante no lo puede eliminar (403)', async () => {
    const rep = await createCaregiver();
    const other = await createCaregiver();
    const childId = await seedChild(rep);
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Tío', false)`,
      [other.userId, childId],
    );
    const checkup = await seedCheckup(childId, rep.userId);

    const res = await request(app).delete(`/checkups/${checkup}`).set('Authorization', other.auth);
    expect(res.status).toBe(403);
    expect(await listIds(rep.auth, childId)).toEqual([checkup]);
  });

  it('los controles siguen sin poder editarse ni borrarse de verdad', async () => {
    const rep = await createCaregiver();
    const childId = await seedChild(rep);
    const checkup = await seedCheckup(childId, rep.userId);

    await expect(
      admin.query(`UPDATE checkups SET weight_kg = 99 WHERE id = $1`, [checkup]),
    ).rejects.toThrow(/immutable/);
    await expect(admin.query(`DELETE FROM checkups WHERE id = $1`, [checkup])).rejects.toThrow(
      /immutable/,
    );
  });

  it('DELETE /children/:id oculta al niño y sus controles; solo el representante legal puede', async () => {
    const rep = await createCaregiver();
    const other = await createCaregiver();
    const childId = await seedChild(rep);
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Tío', false)`,
      [other.userId, childId],
    );
    await seedCheckup(childId, rep.userId);

    const denied = await request(app)
      .delete(`/children/${childId}`)
      .set('Authorization', other.auth);
    expect(denied.status).toBe(403);

    const ok = await request(app).delete(`/children/${childId}`).set('Authorization', rep.auth);
    expect(ok.status).toBe(204);

    for (const user of [rep, other]) {
      const list = await request(app).get('/children').set('Authorization', user.auth);
      expect((list.body as Array<{ id: string }>).some((c) => c.id === childId)).toBe(false);
      const one = await request(app).get(`/children/${childId}`).set('Authorization', user.auth);
      expect(one.status).toBeGreaterThanOrEqual(400);
    }
    const { rows } = await admin.query(`SELECT deleted_at FROM children WHERE id = $1`, [childId]);
    expect(rows[0].deleted_at).not.toBeNull();
  });
});
