/**
 * Tests de integración para GET /referencia/curvas (RF-10, RT-08).
 *
 * Criterios de aceptación verificados:
 *  ✅ GET /referencia/curvas?indicador=&sexo= existe y responde 200.
 *  ✅ Devuelve las 5 series por edad (P/E, T/E, IMC/E) o por talla (P/T).
 *  ✅ Respuesta cacheable (Cache-Control: public, max-age=86400).
 *  ✅ Respuesta versionada (campo `version: "WHO 2006"`).
 *  ✅ Validación de parámetros obligatorios → 400 Zod.
 */

import { CurvasResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

describe('GET /referencia/curvas', () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── CA 1: Ruta existe y responde 200 ────────────────────────────────────

  it('devuelve 200 para WEIGHT_FOR_AGE FEMALE', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_AGE MALE', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=MALE');
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para LENGTH_HEIGHT_FOR_AGE FEMALE', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=LENGTH_HEIGHT_FOR_AGE&sexo=FEMALE',
    );
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para BMI_FOR_AGE MALE', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=BMI_FOR_AGE&sexo=MALE');
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_LENGTH_HEIGHT FEMALE (posición automática)', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_LENGTH_HEIGHT&sexo=FEMALE',
    );
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_LENGTH_HEIGHT MALE posicion=RECUMBENT', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_LENGTH_HEIGHT&sexo=MALE&posicion=RECUMBENT',
    );
    expect(res.status).toBe(200);
  });

  it('devuelve 200 para WEIGHT_FOR_LENGTH_HEIGHT MALE posicion=STANDING', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_LENGTH_HEIGHT&sexo=MALE&posicion=STANDING',
    );
    expect(res.status).toBe(200);
  });

  // ─── CA 2: Las 5 series y sus puntos ─────────────────────────────────────

  it('respuesta válida según CurvasResponseSchema para P/E', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    const parsed = CurvasResponseSchema.safeParse(res.body);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
  });

  it('devuelve exactamente 5 curvas: -3, -2, 0, +2, +3', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    expect(Object.keys(res.body.curvas).sort()).toEqual(['-3', '-2', '0', '+2', '+3'].sort());
  });

  it('P/E: las 5 series tienen la misma longitud (49 puntos, meses 12–60)', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    const { curvas } = res.body;
    const longitudes = Object.values(curvas).map((s: unknown) => (s as unknown[]).length);
    // Todas iguales
    expect(new Set(longitudes).size).toBe(1);
    // 49 puntos: meses 12, 13, … 60
    expect(longitudes[0]).toBe(49);
  });

  it('P/E: primer punto tiene x=12 y los valores y son positivos', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    const { curvas } = res.body;
    for (const key of ['-3', '-2', '0', '+2', '+3']) {
      const primer = curvas[key][0] as { x: number; y: number };
      expect(primer.x).toBe(12);
      expect(primer.y).toBeGreaterThan(0);
    }
  });

  it('P/E: las curvas están ordenadas: z=-3 < z=-2 < z=0 < z=+2 < z=+3 en cada punto', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    const { curvas } = res.body;
    const len = (curvas['-3'] as unknown[]).length;
    for (let i = 0; i < len; i++) {
      const vals = ['-3', '-2', '0', '+2', '+3'].map(
        (k) => ((curvas[k] as { y: number }[])[i] as { y: number }).y,
      );
      for (let j = 0; j < vals.length - 1; j++) {
        expect(vals[j]!).toBeLessThan(vals[j + 1]!);
      }
    }
  });

  it('P/T sin posición: ejeX es longitud_cm', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_LENGTH_HEIGHT&sexo=FEMALE',
    );
    expect(res.body.ejeX).toBe('longitud_cm');
  });

  it('P/T posicion=STANDING: ejeX es talla_cm', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_LENGTH_HEIGHT&sexo=MALE&posicion=STANDING',
    );
    expect(res.body.ejeX).toBe('talla_cm');
  });

  it('P/T posicion=RECUMBENT: ejeX es longitud_cm', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_LENGTH_HEIGHT&sexo=MALE&posicion=RECUMBENT',
    );
    expect(res.body.ejeX).toBe('longitud_cm');
  });

  it('P/E: ejeX es edad_meses', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=MALE');
    expect(res.body.ejeX).toBe('edad_meses');
  });

  it('T/E: ejeX es edad_meses', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=LENGTH_HEIGHT_FOR_AGE&sexo=FEMALE',
    );
    expect(res.body.ejeX).toBe('edad_meses');
  });

  // ─── CA 3: Respuesta cacheable y versionada (RT-08) ──────────────────────

  it('incluye Cache-Control: public, max-age=86400', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers['cache-control']).toContain('max-age=86400');
  });

  it('incluye stale-while-revalidate en Cache-Control', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    expect(res.headers['cache-control']).toContain('stale-while-revalidate=3600');
  });

  it('versión de referencia es "WHO 2006" (RT-08)', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE');
    expect(res.body.version).toBe('WHO 2006');
  });

  // ─── Validación de parámetros obligatorios ────────────────────────────────

  it('sin sexo → 400 con issues Zod', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('sin indicador → 400 con issues Zod', async () => {
    const res = await request(app).get('/referencia/curvas?sexo=FEMALE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('indicador inválido → 400', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=INVALID_INDICATOR&sexo=FEMALE',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('sexo inválido → 400', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=OTRO');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('posicion inválida → 400', async () => {
    const res = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_LENGTH_HEIGHT&sexo=MALE&posicion=LYING',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('sin parámetros → 400', async () => {
    const res = await request(app).get('/referencia/curvas');
    expect(res.status).toBe(400);
  });

  // ─── Consistencia entre sexos ─────────────────────────────────────────────

  it('P/E FEMALE y MALE devuelven puntos diferentes (tablas distintas)', async () => {
    const female = await request(app).get(
      '/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=FEMALE',
    );
    const male = await request(app).get('/referencia/curvas?indicador=WEIGHT_FOR_AGE&sexo=MALE');
    // La mediana (z=0) del primer punto debe ser diferente entre sexos
    const y0Female = ((female.body.curvas['0'] as { y: number }[])[0] as { y: number }).y;
    const y0Male = ((male.body.curvas['0'] as { y: number }[])[0] as { y: number }).y;
    expect(y0Female).not.toBe(y0Male);
  });

  it('indicador y sexo reflejados en la respuesta', async () => {
    const res = await request(app).get('/referencia/curvas?indicador=BMI_FOR_AGE&sexo=MALE');
    expect(res.body.indicador).toBe('BMI_FOR_AGE');
    expect(res.body.sexo).toBe('MALE');
  });
});
