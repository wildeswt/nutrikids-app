import crypto from 'node:crypto';
import { FeedingLogResponseSchema } from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { PERMISSIONS_BY_ACTOR } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';
import { encryptPii } from '../lib/pii-crypto.js';
import { signAccessToken } from '../services/token.service.js';

/**
 * Registro de alimentación (RF-06, NK-39): `/children/:childId/feeding-logs`.
 * Cada test usa usuarios y niños propios; el estado se lee con el cliente `admin` (sin RLS).
 */

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

const isoDate = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

type Specialty = 'nursing' | 'nutrition' | 'pediatrics';

describe('Permisos de alimentación (unidad)', () => {
  it('todos los actores pueden leer y registrar alimentación', () => {
    for (const actor of Object.values(PERMISSIONS_BY_ACTOR)) {
      expect(actor).toContain('feedinglog:read');
      expect(actor).toContain('feedinglog:create');
    }
  });
});

describe('Feeding logs API (/children/:childId/feeding-logs)', { timeout: 60000 }, () => {
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
    token: string;
  }

  async function createUser(
    role: 'CAREGIVER' | 'PROFESSIONAL',
    specialty: Specialty = 'nutrition',
  ): Promise<TestUser> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', $3, $4, 'active', now())`,
      [
        userId,
        `feeding-${userId}@nutrikids.local`,
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
        `INSERT INTO professionals (user_id, specialty, license_number) VALUES ($1, $2, $3)`,
        [userId, specialty, `LIC-${userId.slice(0, 8)}`],
      );
    }
    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: [role],
      specialty: role === 'PROFESSIONAL' ? specialty : null,
    });
    return { userId, token: `Bearer ${accessToken}` };
  }

  async function seedChild(caregiverId: string, withConsent = true): Promise<string> {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, CURRENT_DATE - 900, 'MALE')`,
      [
        childId,
        encryptPii('Mateo', 'children:first_name'),
        encryptPii('Test', 'children:last_name'),
      ],
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

  async function setup() {
    const caregiver = await createUser('CAREGIVER');
    const professional = await createUser('PROFESSIONAL');
    const childId = await seedChild(caregiver.userId);
    await linkProfessional(childId, professional.userId);
    return { caregiver, professional, childId };
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    logDate: isoDate(-1),
    mealsPerDay: 4,
    details: 'Desayuno con avena y fruta; almuerzo con menestra y arroz',
    ...overrides,
  });

  const post = (user: TestUser, childId: string, payload: Record<string, unknown>) =>
    request(app)
      .post(`/children/${childId}/feeding-logs`)
      .set('Authorization', user.token)
      .send(payload);

  const list = (user: TestUser, childId: string, query = '') =>
    request(app).get(`/children/${childId}/feeding-logs${query}`).set('Authorization', user.token);

  async function dbLogs(childId: string) {
    const { rows } = await admin.query(
      `SELECT id, to_char(log_date, 'YYYY-MM-DD') AS log_date, meals_per_day, details
         FROM feeding_logs WHERE child_id = $1 ORDER BY log_date`,
      [childId],
    );
    return rows as {
      id: string;
      log_date: string;
      meals_per_day: number;
      details: string | null;
    }[];
  }

  async function auditCount(userId: string, action: string, entityId: string): Promise<number> {
    let count = 0;
    for (let i = 0; i < 20 && count === 0; i += 1) {
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE user_id = $1 AND action = $2 AND entity_type = 'feeding_logs' AND entity_id = $3`,
        [userId, action, entityId],
      );
      count = rows[0].n as number;
      if (count === 0) await new Promise((r) => setTimeout(r, 100));
    }
    return count;
  }

  describe('POST', () => {
    it('el cuidador registra la alimentación del día (201) y queda en la base', async () => {
      const { caregiver, childId } = await setup();
      const payload = body();
      const res = await post(caregiver, childId, payload);

      expect(res.status).toBe(201);
      expect(FeedingLogResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toEqual({
        id: payload.id,
        childId,
        logDate: payload.logDate,
        mealsPerDay: 4,
        details: payload.details,
      });
      expect(await dbLogs(childId)).toEqual([
        {
          id: payload.id,
          log_date: payload.logDate,
          meals_per_day: 4,
          details: payload.details,
        },
      ]);
    });

    it('el detalle es opcional y se aceptan 0 y 12 comidas', async () => {
      const { caregiver, childId } = await setup();
      const a = await post(caregiver, childId, body({ details: undefined, mealsPerDay: 0 }));
      const b = await post(caregiver, childId, body({ logDate: isoDate(-2), mealsPerDay: 12 }));
      expect(a.status).toBe(201);
      expect(a.body.details).toBeNull();
      expect(a.body.mealsPerDay).toBe(0);
      expect(b.status).toBe(201);
    });

    it.each(['nursing', 'nutrition', 'pediatrics'] as const)(
      'un profesional de %s vinculado también puede registrar',
      async (specialty) => {
        const caregiver = await createUser('CAREGIVER');
        const professional = await createUser('PROFESSIONAL', specialty);
        const childId = await seedChild(caregiver.userId);
        await linkProfessional(childId, professional.userId);
        expect((await post(professional, childId, body())).status).toBe(201);
      },
    );

    it('es idempotente por id: reenviar devuelve 200 sin duplicar', async () => {
      const { caregiver, childId } = await setup();
      const payload = body();
      expect((await post(caregiver, childId, payload)).status).toBe(201);
      const again = await post(caregiver, childId, payload);
      expect(again.status).toBe(200);
      expect(again.body.id).toBe(payload.id);
      expect(await dbLogs(childId)).toHaveLength(1);
    });

    it('reenvíos concurrentes del mismo id no duplican', async () => {
      const { caregiver, childId } = await setup();
      const payload = body();
      const results = await Promise.all(
        Array.from({ length: 4 }, () => post(caregiver, childId, payload)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
      expect(await dbLogs(childId)).toHaveLength(1);
    });

    it('un id que pertenece a otro niño responde 409 y no modifica nada', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childA = await seedChild(caregiver.userId);
      const childB = await seedChild(caregiver.userId);
      const payload = body();
      expect((await post(caregiver, childA, payload)).status).toBe(201);
      expect((await post(caregiver, childB, payload)).status).toBe(409);
      expect(await dbLogs(childB)).toHaveLength(0);
    });

    it('un id de un niño ajeno (invisible por RLS) responde 409 sin revelar datos', async () => {
      const { caregiver, childId } = await setup();
      const other = await createUser('CAREGIVER');
      const otherChild = await seedChild(other.userId);
      const payload = body();
      expect((await post(other, otherChild, payload)).status).toBe(201);

      const res = await post(caregiver, childId, payload);
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toContain(otherChild);
      expect(await dbLogs(childId)).toHaveLength(0);
    });

    it('sin consentimiento vigente responde 403 y no guarda nada', async () => {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId, false);
      const res = await post(caregiver, childId, body());
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/consentimiento/i);
      expect(await dbLogs(childId)).toHaveLength(0);
    });

    it('con el consentimiento revocado responde 403', async () => {
      const { caregiver, professional, childId } = await setup();
      await admin.query(`UPDATE consents SET revoked_at = now() WHERE child_id = $1`, [childId]);
      expect((await post(caregiver, childId, body())).status).toBe(403);
      expect((await post(professional, childId, body())).status).toBe(403);
      expect(await dbLogs(childId)).toHaveLength(0);
    });

    it('un cuidador sin vínculo con el niño recibe 403', async () => {
      const { childId } = await setup();
      const stranger = await createUser('CAREGIVER');
      expect((await post(stranger, childId, body())).status).toBe(403);
      expect(await dbLogs(childId)).toHaveLength(0);
    });

    it('un profesional sin vínculo, o con vínculo vencido, recibe 403', async () => {
      const { childId, caregiver } = await setup();
      const unlinked = await createUser('PROFESSIONAL');
      const expired = await createUser('PROFESSIONAL');
      await linkProfessional(childId, expired.userId, true);

      expect((await post(unlinked, childId, body())).status).toBe(403);
      expect((await post(expired, childId, body())).status).toBe(403);
      expect((await list(unlinked, childId)).status).toBe(403);
      expect((await list(expired, childId)).status).toBe(403);
      expect(await dbLogs(childId)).toHaveLength(0);
      expect(caregiver.userId).toBeTruthy();
    });

    it('un niño inexistente responde 403, igual que uno ajeno', async () => {
      const { caregiver } = await setup();
      expect((await post(caregiver, crypto.randomUUID(), body())).status).toBe(403);
    });

    it('requiere autenticación (401) y un childId válido (400)', async () => {
      const { caregiver, childId } = await setup();
      const noAuth = await request(app).post(`/children/${childId}/feeding-logs`).send(body());
      expect(noAuth.status).toBe(401);
      expect((await post(caregiver, 'no-es-uuid', body())).status).toBe(400);
    });

    it.each([
      ['más de 12 comidas', { mealsPerDay: 13 }],
      ['comidas negativas', { mealsPerDay: -1 }],
      ['comidas no enteras', { mealsPerDay: 2.5 }],
      ['comidas ausentes', { mealsPerDay: undefined }],
      ['fecha con formato inválido', { logDate: '12/11/2026' }],
      ['fecha futura', { logDate: isoDate(2) }],
      ['fecha anterior al nacimiento', { logDate: isoDate(-1000) }],
      ['detalle vacío', { details: '   ' }],
      ['detalle demasiado largo', { details: 'x'.repeat(501) }],
      ['id inválido', { id: 'abc' }],
      ['campo no permitido', { origin: 'PROFESSIONAL' }],
    ])('rechaza con 400: %s', async (_name, overrides) => {
      const { caregiver, childId } = await setup();
      const res = await post(caregiver, childId, body(overrides));
      expect(res.status).toBe(400);
      expect(await dbLogs(childId)).toHaveLength(0);
    });

    it('registra la creación en la auditoría', async () => {
      const { caregiver, childId } = await setup();
      const res = await post(caregiver, childId, body());
      expect(res.status).toBe(201);
      expect(await auditCount(caregiver.userId, 'CREATE', res.body.id)).toBe(1);
    });
  });

  describe('GET', () => {
    async function seedLogs(user: TestUser, childId: string, days: number[]) {
      for (const d of days) {
        expect(
          (await post(user, childId, body({ logDate: isoDate(-d), mealsPerDay: d }))).status,
        ).toBe(201);
      }
    }

    it('lista del día más reciente al más antiguo, al cuidador y al profesional vinculado', async () => {
      const { caregiver, professional, childId } = await setup();
      await seedLogs(caregiver, childId, [3, 1, 2]);

      for (const user of [caregiver, professional]) {
        const res = await list(user, childId);
        expect(res.status).toBe(200);
        expect(
          (res.body as unknown[]).every((r) => FeedingLogResponseSchema.safeParse(r).success),
        ).toBe(true);
        expect((res.body as { logDate: string }[]).map((r) => r.logDate)).toEqual([
          isoDate(-1),
          isoDate(-2),
          isoDate(-3),
        ]);
      }
    });

    it('filtra por from/to (inclusivos) y limita con limit', async () => {
      const { caregiver, childId } = await setup();
      await seedLogs(caregiver, childId, [1, 2, 3, 4, 5]);

      const range = await list(caregiver, childId, `?from=${isoDate(-4)}&to=${isoDate(-2)}`);
      expect((range.body as { logDate: string }[]).map((r) => r.logDate)).toEqual([
        isoDate(-2),
        isoDate(-3),
        isoDate(-4),
      ]);

      const limited = await list(caregiver, childId, '?limit=2');
      expect(limited.body).toHaveLength(2);
      expect((limited.body as { logDate: string }[])[0]!.logDate).toBe(isoDate(-1));
    });

    it.each(['?limit=0', '?limit=1000', '?limit=abc', '?from=ayer', '?to=2026-13-40'])(
      'rechaza con 400 la consulta %s',
      async (query) => {
        const { caregiver, childId } = await setup();
        expect((await list(caregiver, childId, query)).status).toBe(400);
      },
    );

    it('aísla a los usuarios: cada cuidador solo ve los registros de sus niños', async () => {
      const { caregiver: a, childId: childA } = await setup();
      const { caregiver: b, childId: childB } = await setup();
      await seedLogs(a, childA, [1]);
      await seedLogs(b, childB, [1, 2]);

      expect(((await list(a, childA)).body as unknown[]).length).toBe(1);
      expect(((await list(b, childB)).body as unknown[]).length).toBe(2);
      // Cruzado: 403, y ningún dato del otro niño en la respuesta.
      const cross = await list(a, childB);
      expect(cross.status).toBe(403);
      expect(JSON.stringify(cross.body)).not.toContain(childB);
    });

    it('un niño sin registros devuelve una lista vacía', async () => {
      const { caregiver, childId } = await setup();
      const res = await list(caregiver, childId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('los registros siguen visibles tras revocar el consentimiento (solo se bloquea escribir)', async () => {
      const { caregiver, childId } = await setup();
      await seedLogs(caregiver, childId, [1]);
      await admin.query(`UPDATE consents SET revoked_at = now() WHERE child_id = $1`, [childId]);
      expect(((await list(caregiver, childId)).body as unknown[]).length).toBe(1);
    });

    it('requiere autenticación (401)', async () => {
      const { childId } = await setup();
      expect((await request(app).get(`/children/${childId}/feeding-logs`)).status).toBe(401);
    });

    it('registra la lectura en la auditoría', async () => {
      const { caregiver, childId } = await setup();
      expect((await list(caregiver, childId)).status).toBe(200);
      expect(await auditCount(caregiver.userId, 'READ', childId)).toBe(1);
    });
  });
});
