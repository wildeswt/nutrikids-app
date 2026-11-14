import crypto from 'node:crypto';
import { EducationalContentResponseSchema } from '@nutrikids/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  EDUCATION_AGE_BANDS,
  EDUCATION_SEED,
  seedEducationalContent,
} from '../lib/seedEducation.js';
import { signAccessToken } from '../services/token.service.js';

/** Contenido educativo (RF-18, NK-40): `GET /education?ageMonths=&language=`. */

describe('Education seed (unidad)', () => {
  it('trae al menos 5 artículos por tramo de edad, con ids únicos y válidos', () => {
    for (const band of EDUCATION_AGE_BANDS) {
      const inBand = EDUCATION_SEED.filter(
        (a) => a.minAgeMonths === band.min && a.maxAgeMonths === band.max,
      );
      expect(inBand.length).toBeGreaterThanOrEqual(5);
    }
    const ids = EDUCATION_SEED.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of EDUCATION_SEED) {
      expect(EducationalContentResponseSchema.safeParse(a).success).toBe(true);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.body.length).toBeGreaterThan(0);
    }
  });

  it('los tramos cubren de 12 a 60 meses sin huecos ni solapes', () => {
    expect(EDUCATION_AGE_BANDS[0]!.min).toBe(12);
    expect(EDUCATION_AGE_BANDS.at(-1)!.max).toBe(60);
    EDUCATION_AGE_BANDS.slice(1).forEach((band, i) => {
      expect(band.min).toBe(EDUCATION_AGE_BANDS[i]!.max + 1);
    });
  });
});

const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

/** Idioma reservado a estas pruebas, para no depender del seed ni mezclarse con él. */
const TEST_LANG = 'zz';

describe('Education API (/education)', { timeout: 60000 }, () => {
  const app = createApp();
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminConnectionString });
    await admin.connect();
    await seedEducationalContent(prisma);
    await admin.query(`DELETE FROM educational_contents WHERE language = $1`, [TEST_LANG]);
    const rows: [string, number, number][] = [
      ['Solo 12 a 23', 12, 23],
      ['Solo 24 a 35', 24, 35],
      ['Todas las edades', 12, 60],
    ];
    for (const [title, min, max] of rows) {
      await admin.query(
        `INSERT INTO educational_contents (id, title, body, min_age_months, max_age_months, language)
         VALUES ($1, $2, 'texto', $3, $4, $5)`,
        [crypto.randomUUID(), title, min, max, TEST_LANG],
      );
    }
  });

  afterAll(async () => {
    await admin?.query(`DELETE FROM educational_contents WHERE language = $1`, [TEST_LANG]);
    await admin?.end();
    await prisma.$disconnect();
  });

  async function tokenFor(role: 'CAREGIVER' | 'PROFESSIONAL'): Promise<string> {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'hash', 'Test', 'User', 'active', now())`,
      [userId, `education-${userId}@nutrikids.local`],
    );
    if (role === 'CAREGIVER') {
      await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+593990000')`, [
        userId,
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
    return `Bearer ${accessToken}`;
  }

  const get = (token: string, query = '') =>
    request(app).get(`/education${query}`).set('Authorization', token);

  const titles = (body: unknown) => (body as { title: string }[]).map((a) => a.title);

  it('lo leen un cuidador y un profesional, sin vínculo con ningún niño', async () => {
    for (const role of ['CAREGIVER', 'PROFESSIONAL'] as const) {
      const res = await get(await tokenFor(role), '?ageMonths=30');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('requiere autenticación (401)', async () => {
    expect((await request(app).get('/education?ageMonths=30')).status).toBe(401);
  });

  it('filtra por la edad en meses, con límites inclusivos', async () => {
    const token = await tokenFor('CAREGIVER');
    const at = async (age: number) =>
      titles((await get(token, `?ageMonths=${age}&language=${TEST_LANG}`)).body);

    expect(await at(11)).toEqual([]);
    expect(await at(12)).toEqual(['Solo 12 a 23', 'Todas las edades']);
    expect(await at(23)).toContain('Solo 12 a 23');
    expect(await at(24)).not.toContain('Solo 12 a 23');
    expect(await at(24)).toContain('Solo 24 a 35');
    expect(await at(35)).toContain('Solo 24 a 35');
    expect(await at(36)).toEqual(['Todas las edades']);
    expect(await at(60)).toEqual(['Todas las edades']);
    expect(await at(61)).toEqual([]);
  });

  it('filtra por idioma y usa español por defecto', async () => {
    const token = await tokenFor('CAREGIVER');
    const es = await get(token, '?ageMonths=30');
    expect((es.body as { language: string }[]).every((a) => a.language === 'es')).toBe(true);
    expect(es.body).toEqual((await get(token, '?ageMonths=30&language=es')).body);

    const zz = await get(token, `?ageMonths=30&language=${TEST_LANG}`);
    expect((zz.body as { language: string }[]).every((a) => a.language === TEST_LANG)).toBe(true);
    expect((await get(token, '?ageMonths=30&language=qu')).body).toEqual([]);
  });

  it('el seed responde al menos 5 artículos para cada tramo de edad', async () => {
    const token = await tokenFor('CAREGIVER');
    for (const band of EDUCATION_AGE_BANDS) {
      for (const age of [band.min, band.max]) {
        const res = await get(token, `?ageMonths=${age}&language=es`);
        expect(res.body.length).toBeGreaterThanOrEqual(5);
        expect(
          (res.body as unknown[]).every(
            (a) => EducationalContentResponseSchema.safeParse(a).success,
          ),
        ).toBe(true);
      }
    }
  });

  it('sin ageMonths devuelve todo el catálogo del idioma, ordenado por tramo', async () => {
    const token = await tokenFor('CAREGIVER');
    const res = await get(token);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(EDUCATION_SEED.length);
    const mins = (res.body as { minAgeMonths: number }[]).map((a) => a.minAgeMonths);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it('permite revalidar con ETag (304) para la lectura sin conexión', async () => {
    const token = await tokenFor('CAREGIVER');
    const first = await get(token, '?language=es');
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();
    const again = await get(token, '?language=es').set('If-None-Match', etag);
    expect(again.status).toBe(304);
  });

  it.each(['?ageMonths=abc', '?ageMonths=-1', '?ageMonths=12.5', '?ageMonths=999', '?language=e5'])(
    'rechaza con 400 la consulta %s',
    async (query) => {
      expect((await get(await tokenFor('CAREGIVER'), query)).status).toBe(400);
    },
  );

  it('el seed es idempotente: correrlo de nuevo no duplica ni cambia el total', async () => {
    const count = async () =>
      (
        await admin.query(
          `SELECT count(*)::int AS n FROM educational_contents WHERE id = ANY($1::uuid[])`,
          [EDUCATION_SEED.map((a) => a.id)],
        )
      ).rows[0].n as number;
    await seedEducationalContent(prisma);
    const before = await count();
    await seedEducationalContent(prisma);
    expect(before).toBe(EDUCATION_SEED.length);
    expect(await count()).toBe(before);
  });
});
