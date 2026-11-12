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

  it('returns 200 for WEIGHT_FOR_AGE FEMALE', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.status).toBe(200);
  });

  it('returns 200 for WEIGHT_FOR_AGE MALE', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=MALE');
    expect(res.status).toBe(200);
  });

  it('returns 200 for LENGTH_HEIGHT_FOR_AGE FEMALE', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=LENGTH_HEIGHT_FOR_AGE&sex=FEMALE',
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for BMI_FOR_AGE MALE', async () => {
    const res = await request(app).get('/reference/curves?indicator=BMI_FOR_AGE&sex=MALE');
    expect(res.status).toBe(200);
  });

  it('returns 200 for WEIGHT_FOR_LENGTH_HEIGHT FEMALE (automatic position)', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=FEMALE',
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for WEIGHT_FOR_LENGTH_HEIGHT MALE position=RECUMBENT', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=RECUMBENT',
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for WEIGHT_FOR_LENGTH_HEIGHT MALE position=STANDING', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=STANDING',
    );
    expect(res.status).toBe(200);
  });

  // --- AC 2: The 5 series and data points ---

  it('valid response according to OmsReferenceCurvesResponseSchema for WFA', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const parsed = OmsReferenceCurvesResponseSchema.safeParse(res.body);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
  });

  it('returns exactly 5 curves: -3, -2, 0, +2, +3', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(Object.keys(res.body.curves).sort()).toEqual(['-3', '-2', '0', '+2', '+3'].sort());
  });

  it('WFA: all 5 series have the same length (49 points, months 12-60)', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const { curves } = res.body;
    const lengths = Object.values(curves).map((s: unknown) => (s as unknown[]).length);
    expect(new Set(lengths).size).toBe(1);
    expect(lengths[0]).toBe(49);
  });

  it('WFA: first point has x=12 and y values are positive', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const { curves } = res.body;
    for (const key of ['-3', '-2', '0', '+2', '+3']) {
      const first = curves[key][0] as { x: number; y: number };
      expect(first.x).toBe(12);
      expect(first.y).toBeGreaterThan(0);
    }
  });

  it('WFA: curves are monotonically ordered: z=-3 < z=-2 < z=0 < z=+2 < z=+3 at every point', async () => {
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

  it('WFLH without position: xAxis is length_cm', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=FEMALE',
    );
    expect(res.body.xAxis).toBe('length_cm');
  });

  it('WFLH position=STANDING: xAxis is height_cm', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=STANDING',
    );
    expect(res.body.xAxis).toBe('height_cm');
  });

  it('WFLH position=RECUMBENT: xAxis is length_cm', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=RECUMBENT',
    );
    expect(res.body.xAxis).toBe('length_cm');
  });

  it('WFA: xAxis is age_months', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=MALE');
    expect(res.body.xAxis).toBe('age_months');
  });

  it('LHFA: xAxis is age_months', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=LENGTH_HEIGHT_FOR_AGE&sex=FEMALE',
    );
    expect(res.body.xAxis).toBe('age_months');
  });

  // --- AC 3: Cacheable and versioned response (RT-08) ---

  it('includes Cache-Control: public, max-age=86400', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers['cache-control']).toContain('max-age=86400');
  });

  it('includes stale-while-revalidate in Cache-Control', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.headers['cache-control']).toContain('stale-while-revalidate=3600');
  });

  it('reference version is WHO 2006 (RT-08)', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    expect(res.body.version).toBe('WHO 2006');
  });

  // --- Required parameters validation ---

  it('missing sex -> 400 with Zod issues', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('missing indicator -> 400 with Zod issues', async () => {
    const res = await request(app).get('/reference/curves?sex=FEMALE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('invalid indicator -> 400', async () => {
    const res = await request(app).get('/reference/curves?indicator=INVALID_INDICATOR&sex=FEMALE');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('invalid sex -> 400', async () => {
    const res = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=OTHER');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('invalid position -> 400', async () => {
    const res = await request(app).get(
      '/reference/curves?indicator=WEIGHT_FOR_LENGTH_HEIGHT&sex=MALE&position=LYING',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('no parameters -> 400', async () => {
    const res = await request(app).get('/reference/curves');
    expect(res.status).toBe(400);
  });

  // --- Consistency across sexes ---

  it('WFA FEMALE and MALE return different points (different tables)', async () => {
    const female = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=FEMALE');
    const male = await request(app).get('/reference/curves?indicator=WEIGHT_FOR_AGE&sex=MALE');
    const y0Female = ((female.body.curves['0'] as { y: number }[])[0] as { y: number }).y;
    const y0Male = ((male.body.curves['0'] as { y: number }[])[0] as { y: number }).y;
    expect(y0Female).not.toBe(y0Male);
  });

  it('indicator and sex reflected in response', async () => {
    const res = await request(app).get('/reference/curves?indicator=BMI_FOR_AGE&sex=MALE');
    expect(res.body.indicator).toBe('BMI_FOR_AGE');
    expect(res.body.sex).toBe('MALE');
  });
});
