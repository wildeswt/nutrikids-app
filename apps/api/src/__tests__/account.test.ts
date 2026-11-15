import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { encryptPii } from '../lib/pii-crypto.js';
import { signAccessToken } from '../services/token.service.js';

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;
const PASSWORD = 'NutriKids-Test-2026!';

/** Cuenta del usuario autenticado (NK-55). Datos sintéticos. */
describe('GET/PATCH /account (NK-55)', { timeout: 60000 }, () => {
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

  async function createUser(role: 'CAREGIVER' | 'PROFESSIONAL' = 'CAREGIVER') {
    const userId = crypto.randomUUID();
    const email = `account-${userId}@nutrikids.local`;
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', now())`,
      [
        userId,
        email,
        await hashPassword(PASSWORD),
        encryptPii('Ana', 'users:first_name'),
        encryptPii('Prueba', 'users:last_name'),
      ],
    );
    if (role === 'CAREGIVER') {
      await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, $2)`, [
        userId,
        encryptPii('+593990000', 'caregivers:phone'),
      ]);
    } else {
      await admin.query(
        `INSERT INTO professionals (user_id, specialty, license_number) VALUES ($1, 'nursing', $2)`,
        [userId, `LIC-${userId.slice(0, 8)}`],
      );
    }
    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: [role],
      specialty: role === 'PROFESSIONAL' ? 'nursing' : null,
    });
    return { userId, email, auth: `Bearer ${accessToken}` };
  }

  async function waitForAudit(userId: string): Promise<{ details: { fields: string[] } } | null> {
    for (let i = 0; i < 40; i += 1) {
      const { rows } = await admin.query(
        `SELECT details FROM audit_logs
          WHERE user_id = $1 AND action = 'UPDATE' AND entity_type = 'users'
          ORDER BY occurred_at DESC LIMIT 1`,
        [userId],
      );
      if (rows[0]) return rows[0];
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  it('devuelve nombre, correo y teléfono de contacto, y exige sesión', async () => {
    const user = await createUser();

    const res = await request(app).get('/account').set('Authorization', user.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: user.userId,
      email: user.email,
      firstName: 'Ana',
      lastName: 'Prueba',
      phone: '+593990000',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
    expect((await request(app).get('/account')).status).toBe(401);
  });

  it('edita nombre y teléfono sin pedir contraseña, y lo deja en auditoría sin los valores', async () => {
    const user = await createUser();

    const res = await request(app)
      .patch('/account')
      .set('Authorization', user.auth)
      .send({ firstName: '  Andrea ', phone: '+593 98 111 2222' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Andrea', phone: '+593 98 111 2222' });

    const audit = await waitForAudit(user.userId);
    expect(audit?.details.fields.sort()).toEqual(['firstName', 'phone']);
    expect(JSON.stringify(audit)).not.toContain('111 2222');

    const cleared = await request(app)
      .patch('/account')
      .set('Authorization', user.auth)
      .send({ phone: '' });
    expect(cleared.body.phone).toBeNull();
  });

  it('cambiar el correo exige la contraseña actual correcta', async () => {
    const user = await createUser();
    const newEmail = `nuevo-${user.userId}@nutrikids.local`;
    const patch = (body: object) =>
      request(app).patch('/account').set('Authorization', user.auth).send(body);

    expect((await patch({ email: newEmail })).status).toBe(400);
    expect((await patch({ email: newEmail, currentPassword: 'incorrecta' })).status).toBe(403);
    const { rows: unchanged } = await admin.query(`SELECT email FROM users WHERE id = $1`, [
      user.userId,
    ]);
    expect(unchanged[0].email).toBe(user.email);

    const ok = await patch({ email: newEmail.toUpperCase(), currentPassword: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(newEmail);
  });

  it('un correo ya registrado responde 409 y no cambia nada', async () => {
    const user = await createUser();
    const other = await createUser();

    const res = await request(app)
      .patch('/account')
      .set('Authorization', user.auth)
      .send({ email: other.email, currentPassword: PASSWORD });
    expect(res.status).toBe(409);
    const { rows } = await admin.query(`SELECT email FROM users WHERE id = $1`, [user.userId]);
    expect(rows[0].email).toBe(user.email);
  });

  it('valida el cuerpo y un profesional puede editar su nombre (sin teléfono)', async () => {
    const caregiver = await createUser();
    const patch = (body: object) =>
      request(app).patch('/account').set('Authorization', caregiver.auth).send(body);

    for (const bad of [
      {},
      { firstName: '' },
      { phone: 'llámame' },
      { role: 'ADMIN' },
      { id: crypto.randomUUID() },
    ]) {
      expect((await patch(bad)).status, JSON.stringify(bad)).toBe(400);
    }

    const professional = await createUser('PROFESSIONAL');
    const res = await request(app)
      .patch('/account')
      .set('Authorization', professional.auth)
      .send({ firstName: 'Luis', phone: '+593 98 000 0000' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Luis', phone: null });
  });
});
