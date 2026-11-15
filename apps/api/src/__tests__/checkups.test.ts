import crypto from 'node:crypto';
import { CaregiverCheckupResponseSchema, CheckupResponseSchema } from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { encryptPii } from '../lib/pii-crypto.js';
import { signAccessToken } from '../services/token.service.js';

/**
 * Los controles son inmutables (trigger + REVOKE), por lo que estos tests no pueden limpiar lo que
 * crean: cada test usa usuarios y niños propios con UUID aleatorios y no borra nada al terminar.
 */
const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

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

describe(
  'Checkups API (/children/:childId/checkups, /checkups/:id/correction)',
  { timeout: 60000 },
  () => {
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

    async function createUser(
      role: 'CAREGIVER' | 'PROFESSIONAL',
    ): Promise<{ userId: string; token: string }> {
      const userId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', $3, $4, 'active', now())`,
        [
          userId,
          `checkups-${userId}@nutrikids.local`,
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
      const { accessToken } = await signAccessToken({
        sub: userId,
        roles: [role],
        specialty: role === 'PROFESSIONAL' ? 'pediatrics' : null,
      });
      return { userId, token: `Bearer ${accessToken}` };
    }

    async function seedChild(caregiverId: string, ageMonths = 30): Promise<string> {
      const childId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, $4::date, 'MALE')`,
        [
          childId,
          encryptPii('Mateo', 'children:first_name'),
          encryptPii('Test', 'children:last_name'),
          isoDateMonthsAgo(ageMonths),
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

    async function linkProfessional(childId: string, professionalId: string): Promise<void> {
      await admin.query(
        `INSERT INTO professional_children (id, child_id, professional_id, start_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 30)`,
        [crypto.randomUUID(), childId, professionalId],
      );
    }

    const body = (overrides: Record<string, unknown> = {}) => ({
      id: crypto.randomUUID(),
      measuredAt: isoDaysAgo(2),
      weightKg: 12.5,
      lengthHeightCm: 90,
      position: 'STANDING',
      ...overrides,
    });

    /** La auditoría se escribe al cerrar la respuesta: espera brevemente a que aparezca. */
    async function waitForAudit(checkupId: string): Promise<Record<string, unknown>[]> {
      let rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 30; i++) {
        rows = (
          await admin.query(
            `SELECT * FROM audit_logs WHERE action = 'CREATE' AND entity_type = 'checkups'
             AND entity_id = $1::uuid`,
            [checkupId],
          )
        ).rows;
        if (rows.length >= 1) return rows;
        await new Promise((r) => setTimeout(r, 150));
      }
      return rows;
    }

    async function setup() {
      const caregiver = await createUser('CAREGIVER');
      const childId = await seedChild(caregiver.userId);
      return { caregiver, childId };
    }

    describe('POST /children/:childId/checkups', () => {
      it('caregiver records checkup: origin and recordedById set by server, no technical data', async () => {
        const { caregiver, childId } = await setup();
        const payload = body();

        const res = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload);

        expect(res.status).toBe(201);
        expect(CaregiverCheckupResponseSchema.safeParse(res.body).success).toBe(true);
        expect(res.body).toMatchObject({
          id: payload.id,
          childId,
          origin: 'CAREGIVER',
          recordedById: caregiver.userId,
          recordedBy: {
            userId: caregiver.userId,
            firstName: 'Test',
            lastName: 'User',
            role: 'CAREGIVER',
            specialty: null,
          },
          correctedCheckupId: null,
          isCurrent: true,
          notes: null,
          weightKg: 12.5,
          lengthHeightCm: 90,
        });
        expect(res.body).not.toHaveProperty('results');
      });

      it('stores trimmed notes, returns them on GET and excludes note text from audit_logs', async () => {
        const { caregiver, childId } = await setup();
        const pro = await createUser('PROFESSIONAL');
        await linkProfessional(childId, pro.userId);
        const noteText = 'Desayunó avena y fruta antes del control';
        const payload = body({ notes: `  ${noteText}  ` });

        const res = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.notes).toBe(noteText);

        const asCaregiver = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token);
        expect(asCaregiver.status).toBe(200);
        expect(asCaregiver.body[0].notes).toBe(noteText);

        const asPro = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', pro.token);
        expect(asPro.status).toBe(200);
        expect(asPro.body[0].notes).toBe(noteText);

        const audits = await waitForAudit(payload.id as string);
        expect(audits).toHaveLength(1);
        expect(audits[0]!.details).toEqual({ hasNotes: true });
        expect(JSON.stringify(audits[0])).not.toContain(noteText);
      });

      it('rejects empty or >500-char notes with 400', async () => {
        const { caregiver, childId } = await setup();

        const blank = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(body({ notes: '   ' }));
        expect(blank.status).toBe(400);

        const tooLong = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(body({ notes: 'x'.repeat(501) }));
        expect(tooLong.status).toBe(400);
      });

      it('linked professional records checkup with PROFESSIONAL origin and the 4 indicators', async () => {
        const { childId } = await setup();
        const pro = await createUser('PROFESSIONAL');
        await linkProfessional(childId, pro.userId);

        const res = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', pro.token)
          .send(body());

        expect(res.status).toBe(201);
        expect(CheckupResponseSchema.safeParse(res.body).success).toBe(true);
        expect(res.body.origin).toBe('PROFESSIONAL');
        expect(res.body.recordedById).toBe(pro.userId);
        expect(res.body.recordedBy).toEqual({
          userId: pro.userId,
          firstName: 'Test',
          lastName: 'User',
          role: 'PROFESSIONAL',
          specialty: 'pediatrics',
        });
        const indicators = (res.body.results as { indicator: string }[]).map((r) => r.indicator);
        expect(indicators.sort()).toEqual([
          'BMI_FOR_AGE',
          'LENGTH_HEIGHT_FOR_AGE',
          'WEIGHT_FOR_AGE',
          'WEIGHT_FOR_LENGTH_HEIGHT',
        ]);
      });

      it('resending the same id does not duplicate checkup (200 with existing)', async () => {
        const { caregiver, childId } = await setup();
        const payload = body();
        const send = () =>
          request(app)
            .post(`/children/${childId}/checkups`)
            .set('Authorization', caregiver.token)
            .send(payload);

        const first = await send();
        const second = await send();

        expect(first.status).toBe(201);
        expect(second.status).toBe(200);
        expect(second.body.id).toBe(first.body.id);
        const { rows } = await admin.query(
          `SELECT count(*)::int AS n FROM checkups WHERE id = $1`,
          [payload.id],
        );
        expect(rows[0].n).toBe(1);
        const results = await admin.query(
          `SELECT count(*)::int AS n FROM indicator_results WHERE checkup_id = $1`,
          [payload.id],
        );
        expect(results.rows[0].n).toBe(4);
      });

      it('an id already used in another child responds with 409', async () => {
        const { caregiver, childId } = await setup();
        const otherChild = await seedChild(caregiver.userId);
        const payload = body();

        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload)
          .expect(201);
        const res = await request(app)
          .post(`/children/${otherChild}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload);

        expect(res.status).toBe(409);
      });

      it('outlier value requires confirmOutlier; with the flag it is accepted', async () => {
        const { caregiver, childId } = await setup();
        const outlier = { weightKg: 35 };

        const rejected = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(body(outlier));
        expect(rejected.status).toBe(400);

        const accepted = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(body({ ...outlier, confirmOutlier: true }));
        expect(accepted.status).toBe(201);
      });

      it('rejects values outside physical bounds, future dates, and children outside WHO range', async () => {
        const { caregiver, childId } = await setup();
        const post = (cid: string, payload: object) =>
          request(app)
            .post(`/children/${cid}/checkups`)
            .set('Authorization', caregiver.token)
            .send(payload);

        expect((await post(childId, body({ weightKg: 1 }))).status).toBe(400);
        expect(
          (
            await post(
              childId,
              body({ measuredAt: new Date(Date.now() + 86_400_000).toISOString() }),
            )
          ).status,
        ).toBe(400);

        const oldChild = await seedChild(caregiver.userId, 70);
        expect((await post(oldChild, body())).status).toBe(400);
      });

      it('responds 403 without active consent', async () => {
        const { caregiver, childId } = await setup();
        await admin.query(`UPDATE consents SET revoked_at = now() WHERE child_id = $1`, [childId]);

        const res = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(body());

        expect(res.status).toBe(403);
      });

      it('caregiver without link to child receives 403', async () => {
        const { childId } = await setup();
        const stranger = await createUser('CAREGIVER');

        const res = await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', stranger.token)
          .send(body());

        expect(res.status).toBe(403);
      });
    });

    describe('POST /checkups/:checkupId/correction', () => {
      it('creates a new checkup pointing to original and original ceases to be current', async () => {
        const { caregiver, childId } = await setup();
        const original = body();
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(original)
          .expect(201);

        const fix = body({ weightKg: 13.1 });
        const res = await request(app)
          .post(`/checkups/${original.id}/correction`)
          .set('Authorization', caregiver.token)
          .send(fix);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          id: fix.id,
          childId,
          correctedCheckupId: original.id,
          isCurrent: true,
          weightKg: 13.1,
        });

        // Original remains intact with its results.
        const row = await admin.query(`SELECT weight_kg FROM checkups WHERE id = $1`, [
          original.id,
        ]);
        expect(Number(row.rows[0].weight_kg)).toBe(12.5);
        const results = await admin.query(
          `SELECT count(*)::int AS n FROM indicator_results WHERE checkup_id = $1`,
          [original.id],
        );
        expect(results.rows[0].n).toBe(4);

        // The view derives only the current checkup.
        const current = await admin.query(`SELECT id FROM current_checkups WHERE child_id = $1`, [
          childId,
        ]);
        expect(current.rows.map((r) => r.id)).toEqual([fix.id]);
      });

      it('correction stores its own notes without altering original notes or leaking text to audit', async () => {
        const { caregiver, childId } = await setup();
        const original = body({ notes: 'Observación original' });
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(original)
          .expect(201);

        const correctedNote = 'Peso rectificado en báscula calibrada';
        const fix = body({ weightKg: 13.1, notes: `  ${correctedNote}  ` });
        const res = await request(app)
          .post(`/checkups/${original.id}/correction`)
          .set('Authorization', caregiver.token)
          .send(fix);

        expect(res.status).toBe(201);
        expect(res.body.notes).toBe(correctedNote);

        const list = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token);
        const byId = new Map(
          (list.body as Array<{ id: string; notes: string | null }>).map((c) => [c.id, c]),
        );
        expect(byId.get(original.id as string)?.notes).toBe('Observación original');
        expect(byId.get(fix.id as string)?.notes).toBe(correctedNote);

        const audits = await waitForAudit(fix.id as string);
        expect(audits).toHaveLength(1);
        expect(audits[0]!.details).toEqual({ hasNotes: true });
        expect(JSON.stringify(audits[0])).not.toContain(correctedNote);
      });

      it('resending the same correction is idempotent and same checkup cannot be corrected twice', async () => {
        const { caregiver, childId } = await setup();
        const original = body();
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(original)
          .expect(201);
        const fix = body({ weightKg: 13.1 });
        const send = (payload: object) =>
          request(app)
            .post(`/checkups/${original.id}/correction`)
            .set('Authorization', caregiver.token)
            .send(payload);

        expect((await send(fix)).status).toBe(201);
        expect((await send(fix)).status).toBe(200);
        expect((await send(body({ weightKg: 14 }))).status).toBe(409);
      });

      it('non-existent checkup or unlinked child responds 404', async () => {
        const { caregiver, childId } = await setup();
        const original = body();
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(original)
          .expect(201);
        const stranger = await createUser('CAREGIVER');

        const foreign = await request(app)
          .post(`/checkups/${original.id}/correction`)
          .set('Authorization', stranger.token)
          .send(body());
        const missing = await request(app)
          .post(`/checkups/${crypto.randomUUID()}/correction`)
          .set('Authorization', caregiver.token)
          .send(body());

        expect([403, 404]).toContain(foreign.status);
        expect(missing.status).toBe(404);
      });

      it('cannot correct without active consent (403)', async () => {
        const { caregiver, childId } = await setup();
        const original = body();
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(original)
          .expect(201);
        await admin.query(`UPDATE consents SET revoked_at = now() WHERE child_id = $1`, [childId]);

        const res = await request(app)
          .post(`/checkups/${original.id}/correction`)
          .set('Authorization', caregiver.token)
          .send(body());

        expect(res.status).toBe(403);
      });
    });

    describe('GET /children/:childId/checkups', () => {
      it('returns full history in descending measuredAt order with isCurrent', async () => {
        const { caregiver, childId } = await setup();
        const older = body({ measuredAt: isoDaysAgo(20), weightKg: 12.0 });
        const newer = body({ measuredAt: isoDaysAgo(3), weightKg: 12.8 });
        for (const payload of [newer, older]) {
          await request(app)
            .post(`/children/${childId}/checkups`)
            .set('Authorization', caregiver.token)
            .send(payload)
            .expect(201);
        }
        const fix = body({ measuredAt: isoDaysAgo(20), weightKg: 12.2 });
        await request(app)
          .post(`/checkups/${older.id}/correction`)
          .set('Authorization', caregiver.token)
          .send(fix)
          .expect(201);

        const all = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token);
        const onlyCurrent = await request(app)
          .get(`/children/${childId}/checkups?onlyCurrent=true`)
          .set('Authorization', caregiver.token);

        expect(all.status).toBe(200);
        expect(all.body.map((c: { id: string }) => c.id)).toEqual([newer.id, fix.id, older.id]);
        expect(all.body.map((c: { isCurrent: boolean }) => c.isCurrent)).toEqual([
          true,
          true,
          false,
        ]);
        expect(all.body[0]).not.toHaveProperty('results');
        expect(onlyCurrent.body.map((c: { id: string }) => c.id)).toEqual([newer.id, fix.id]);
      });

      it('professional sees technical results and unlinked caregiver receives 403', async () => {
        const { caregiver, childId } = await setup();
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(body())
          .expect(201);
        const pro = await createUser('PROFESSIONAL');
        await linkProfessional(childId, pro.userId);
        const stranger = await createUser('CAREGIVER');

        const asPro = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', pro.token);
        const asStranger = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', stranger.token);

        expect(asPro.status).toBe(200);
        expect(asPro.body[0].results).toHaveLength(4);
        expect(asStranger.status).toBe(403);
      });

      it('returns recordedBy: null when recorder user is anonymized or inactive', async () => {
        const { caregiver, childId } = await setup();
        const payload = body();
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token)
          .send(payload)
          .expect(201);

        // Deactivate recorder (suspended account)
        await admin.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [
          caregiver.userId,
        ]);

        const res = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token);

        expect(res.status).toBe(200);
        expect(res.body[0].recordedBy).toBeNull();
      });

      it('does not leak professional sensitive fields (email, phone, license) to caregiver', async () => {
        const { caregiver, childId } = await setup();
        const pro = await createUser('PROFESSIONAL');
        await linkProfessional(childId, pro.userId);

        const checkupPayload = body();
        await request(app)
          .post(`/children/${childId}/checkups`)
          .set('Authorization', pro.token)
          .send(checkupPayload)
          .expect(201);

        const res = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', caregiver.token);

        expect(res.status).toBe(200);
        const checkup = res.body.find((c: { id: string }) => c.id === checkupPayload.id);
        expect(checkup).toBeDefined();
        expect(checkup.recordedBy).toEqual({
          userId: pro.userId,
          firstName: 'Test',
          lastName: 'User',
          role: 'PROFESSIONAL',
          specialty: 'pediatrics',
        });
        // Verify absence of sensitive professional fields
        expect(checkup.recordedBy).not.toHaveProperty('email');
        expect(checkup.recordedBy).not.toHaveProperty('phone');
        expect(checkup.recordedBy).not.toHaveProperty('licenseNumber');
        expect(checkup.recordedBy).not.toHaveProperty('license_number');
        expect(checkup.recordedBy).not.toHaveProperty('document');
        expect(checkup.recordedBy).not.toHaveProperty('passwordHash');
        expect(checkup.recordedBy).not.toHaveProperty('password_hash');
      });

      it('unlinked professional receives 403 when trying to list child checkups', async () => {
        const { childId } = await setup();
        const unlinkedPro = await createUser('PROFESSIONAL');

        const res = await request(app)
          .get(`/children/${childId}/checkups`)
          .set('Authorization', unlinkedPro.token);

        expect(res.status).toBe(403);
      });
    });
  },
);
