import { describe, it, expect } from 'vitest';
import { assertNotProduction, buildMateoCheckups } from '../lib/seedDev.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('seed de desarrollo (sin BD)', () => {
  const checkups = buildMateoCheckups();
  const oct = checkups.find((c) => c.n === 4)!;
  const pt = (c: (typeof checkups)[number]) =>
    c.results.find((r) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT')!;

  it('genera 4 controles con 4 resultados cada uno e ids UUID únicos', () => {
    expect(checkups).toHaveLength(4);
    for (const c of checkups) expect(c.results).toHaveLength(4);
    const ids = checkups.flatMap((c) => [c.id, ...c.results.map((r) => r.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID);
  });

  it('el control del 18 oct (12,2 kg, 97,0 cm) da z P/T ≈ −2,2 y emaciación', () => {
    expect(oct.weightKg).toBe(12.2);
    expect(oct.lengthHeightCm).toBe(97.0);
    expect(oct.ageMonths).toBe(41);
    expect(pt(oct).zScore).toBeLessThan(-2);
    expect(Math.abs(pt(oct).zScore - -2.2)).toBeLessThanOrEqual(0.15);
    expect(pt(oct).classification).toBe('emaciacion');
  });

  it('los 3 controles previos no generan alerta en P/T y están en orden cronológico', () => {
    for (const c of checkups.filter((x) => x.n < 4)) {
      expect(pt(c).classification).toBe('normal');
      expect(Math.abs(pt(c).zScore)).toBeLessThan(0.3);
    }
    const times = checkups.map((c) => c.measuredAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('se niega a correr en producción', () => {
    expect(() => assertNotProduction('production')).toThrow(/production/);
    expect(() => assertNotProduction('development')).not.toThrow();
    expect(() => assertNotProduction(undefined)).not.toThrow();
  });
});
