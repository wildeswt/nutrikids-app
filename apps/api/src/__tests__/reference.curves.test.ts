import { OmsReferenceCurvesResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

describe('GET /reference/curves', () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── CA 1: Ruta existe y responde 200 ────────────────────────────────────

  it('devuelve 200 para WEIGHT_FOR_AGE FEMALE', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_AGE MALE', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=MALE');
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para LENGTH_HEIGHT_FOR_AGE FEMALE', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=LENGTH_HEIGHT_FOR_AGE&sex=FEMALE',
    );
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para BMI_FOR_AGE MALE', async () => {
    const res = await request(app).get('/reference/curves?indicator=BMI_FOR_AGE&sex=MALE');
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_LENGTH_HEIGHT FEMALE (posición automática)', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=FEMALE',
    );
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_LENGTH_HEIGHT MALE position=RECUMBENT', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=RECUMBENT',
    );
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_LENGTH_HEIGHT MALE position=STANDING', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=STANDING',
    );
    expect(res.status).toBe(200);
  });

  // ─── CA 2: Las 5 series y sus puntos ─────────────────────────────────────

  it('respuesta válida según OmsReferenceCurvesResponseSchema para P/E', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const parsed = OmsReferenceCurvesResponseSchema.safeParse(res.body);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
  });

  it('devuelve exactamente 5 curvas: -3, -2, 0, +2, +3', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(Object.keys(res.body.curves).sort()).toEqual(['-3', '-2', '0', '+2', '+3'].sort());
  });

  it('P/E: las 5 series tienen la misma longitud (49 puntos, meses 12–60)', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const { curves } = res.body;
    const lengths = Object.values(curves).map((s: unknown) => (s as unknown[]).length);
    // Todas iguales
    expect(new Set(lengths).size).toBe(1);
    // 49 puntos: meses 12, 13, … 60
    expect(lengths[0]).toBe(49);
  });

  it('P/E: primer punto tiene x=12 y los valores y son positivos', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const { curves } = res.body;
    for (const key of ['-3', '-2', '0', '+2', '+3']) {
      const first = curves[key][0] as { x: number; y: number };
      expect(first.x).toBe(12);
      expect(first.y).toBeGreaterThan(0);
    }
  });

  it('P/E: las curvas están ordenadas: z=-3 < z=-2 < z=0 < z=+2 < z=+3 en cada punto', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const { curves } = res.body;
    const len = (curves['-3'] as unknown[]).length;
    for (let i = 0; i < len; i++) {
      const vals = ['-3', '-2', '0', '+2', '+3'].map(
        (k) => ((curves[k] as { y: number }[])[i] as { y: number }).y,
      );
      for (let j = 0; j < vals.length - 1; j++) {
        expect(vals[j]!).toBeLessThan(vals[j + 1]!);
      }
    }
  });

  it('P/T sin posición: xAxis es length_cm', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=FEMALE',
    );
    expect(res.body.xAxis).toBe('length_cm');
  });

  it('P/T position=STANDING: xAxis es height_cm', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=STANDING',
    );
    expect(res.body.xAxis).toBe('height_cm');
  });

  it('P/T position=RECUMBENT: xAxis es length_cm', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=RECUMBENT',
    );
    expect(res.body.xAxis).toBe('length_cm');
  });

  it('P/E: xAxis es age_months', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=MALE');
    expect(res.body.xAxis).toBe('age_months');
  });

  it('T/E: xAxis es age_months', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=LENGTH_HEIGHT_FOR_AGE&sex=FEMALE',
    );
    expect(res.body.xAxis).toBe('age_months');
  });

  // ─── CA 3: Respuesta cacheable y versionada (RT-08) ──────────────────────

  it('incluye Cache-Control: public, max-age=86400', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers['cache-control']).toContain('max-age=86400');
  });

  it('incluye stale-while-revalidate en Cache-Control', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.headers['cache-control']).toContain('stale-while-revalidate=3600');
  });

  it('versión de referencia es "WHO 2006" (RT-08)', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.body.version).toBe('WHO 2006');
  });

  // ─── Validación de parámetros obligatorios ────────────────────────────────

  it('sin sex → 400 con issues Zod', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('sin indicator → 400 con issues Zod', async () => {
    const res = await request(app).get('/reference/curves?sex=FEMALE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('indicator inválido → 400', async () => {
    const res = await request(app).get('/reference/curves?indicator=INVALID_INDICATOR&sex=FEMALE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('sex inválido → 400', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=OTRO');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('position inválida → 400', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=LYING',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('sin parámetros → 400', async () => {
    const res = await request(app).get('/reference/curves');
    expect(res.status).toBe(400);
  });

  // ─── Consistencia entre sexos ─────────────────────────────────────────────

  it('P/E FEMALE y MALE devuelven puntos diferentes (tablas distintas)', async () => {
    const female = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const male = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=MALE');
    const y0Female = ((female.body.curves['0'] as { y: number }[])[0] as { y: number }).y;
    const y0Male = ((male.body.curves['0'] as { y: number }[])[0] as { y: number }).y;
    expect(y0Female).not.toBe(y0Male);
  });

  it('indicator y sex reflejados en la respuesta', async () => {
    const res = await request(app).get('/reference/curves?indicator=BMI_FOR_AGE&sex=MALE');
    expect(res.body.indicator).toBe('BMI_FOR_AGE');
    expect(res.body.sex).toBe('MALE');
  });
});
