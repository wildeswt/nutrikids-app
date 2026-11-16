import { describe, expect, it } from 'vitest';
import {
  Z_CURVES,
  calculateZScore,
  measurementFromZScore,
  percentileFromZScore,
  zScoreCurves,
} from './lms.js';
import {
  BFA_FEMALE,
  BFA_MALE,
  LHFA_FEMALE,
  LHFA_MALE,
  WFA_FEMALE,
  WFA_MALE,
  WFH_FEMALE,
  WFH_MALE,
  WFLH_FEMALE,
  WFLH_MALE,
  WFL_FEMALE,
  WFL_MALE,
  type LmsRow,
} from './tables/index.js';

describe('calculateZScore', () => {
  it('computes z-score when L != 0: ((x/M)^L - 1) / (L * S)', () => {
    // (110/100)^-0.5 = 0.953463; (0.953463-1)/(-0.5*0.1) = 0.93074
    expect(calculateZScore(110, -0.5, 100, 0.1)).toBeCloseTo(0.93074, 4);
  });

  it('computes z-score when L = 0: ln(x/M) / S', () => {
    expect(calculateZScore(110, 0, 100, 0.1)).toBeCloseTo(Math.log(1.1) / 0.1, 10);
  });

  it('yields z = 0 when x equals median M', () => {
    expect(calculateZScore(100, 0, 100, 0.1)).toBe(0);
    expect(calculateZScore(100, 1.2, 100, 0.1)).toBe(0);
  });

  it('converges to logarithmic form as L approaches 0', () => {
    expect(calculateZScore(110, 1e-9, 100, 0.1)).toBeCloseTo(calculateZScore(110, 0, 100, 0.1), 5);
  });

  it('rejects invalid parameters', () => {
    expect(() => calculateZScore(0, 0, 100, 0.1)).toThrow(RangeError);
    expect(() => calculateZScore(-1, 0, 100, 0.1)).toThrow(RangeError);
    expect(() => calculateZScore(NaN, 0, 100, 0.1)).toThrow(RangeError);
    expect(() => calculateZScore(10, 0, 0, 0.1)).toThrow(RangeError);
    expect(() => calculateZScore(10, 0, 100, 0)).toThrow(RangeError);
    expect(() => calculateZScore(10, Infinity, 100, 0.1)).toThrow(RangeError);
  });
});

describe('measurementFromZScore and round-trip consistency', () => {
  const testCases = [
    { name: 'L = 0', L: 0, M: 15, S: 0.08 },
    { name: 'L < 0', L: -0.3521, M: 14.5, S: 0.0825 },
    { name: 'L > 0', L: 1.2, M: 90, S: 0.04 },
  ];

  for (const { name, L, M, S } of testCases) {
    describe(name, () => {
      it('returns median M for z = 0', () => {
        expect(measurementFromZScore(0, L, M, S)).toBeCloseTo(M, 10);
      });

      for (const z of Z_CURVES) {
        it(`calculateZScore(measurementFromZScore(${z})) is approximately ${z}`, () => {
          expect(calculateZScore(measurementFromZScore(z, L, M, S), L, M, S)).toBeCloseTo(z, 9);
        });
      }

      it('measurementFromZScore(calculateZScore(x)) is approximately x', () => {
        for (const x of [M * 0.7, M * 0.9, M, M * 1.1, M * 1.3]) {
          expect(measurementFromZScore(calculateZScore(x, L, M, S), L, M, S)).toBeCloseTo(x, 9);
        }
      });

      it('zScoreCurves strictly increases with z', () => {
        const c = zScoreCurves(L, M, S);
        expect(c[-3]).toBeLessThan(c[-2]);
        expect(c[-2]).toBeLessThan(c[0]);
        expect(c[0]).toBeLessThan(c[2]);
        expect(c[2]).toBeLessThan(c[3]);
        expect(c[0]).toBeCloseTo(M, 10);
      });
    });
  }

  it('rejects z-score outside domain (base <= 0)', () => {
    // 1 + L * S * z = 1 + (-2) * (0.5) * (2) = -1
    expect(() => measurementFromZScore(2, -2, 10, 0.5)).toThrow(RangeError);
  });
});

describe('percentileFromZScore', () => {
  it('maps z = 0 to 50th percentile', () => {
    expect(percentileFromZScore(0)).toBeCloseTo(50, 5);
  });

  it('maps standard normal distribution landmarks accurately', () => {
    expect(percentileFromZScore(1.96)).toBeCloseTo(97.5, 1);
    expect(percentileFromZScore(-1.96)).toBeCloseTo(2.5, 1);
    expect(percentileFromZScore(-2)).toBeCloseTo(2.275, 2);
    expect(percentileFromZScore(3)).toBeCloseTo(99.865, 2);
  });

  it('exhibits symmetry and bounded output', () => {
    expect(percentileFromZScore(1.3) + percentileFromZScore(-1.3)).toBeCloseTo(100, 5);
    expect(percentileFromZScore(10)).toBeLessThanOrEqual(100);
    expect(percentileFromZScore(-10)).toBeGreaterThanOrEqual(0);
  });
});

describe('Mateo benchmark case (12.2 kg at 97.0 cm)', () => {
  // Approximate WHO LMS parameters for weight-for-length/height, boys, 97.0 cm
  const L = -0.3521;
  const M = 14.5;
  const S = 0.0825;

  it('evaluates z-score approximately equal to -2.2', () => {
    const z = calculateZScore(12.2, L, M, S);
    expect(Math.abs(z - -2.2)).toBeLessThanOrEqual(0.1);
  });
});

describe('PU-02: round-trip consistency across all WHO LMS table rows', () => {
  const tables: Array<[string, LmsRow[]]> = [
    ['WFA_FEMALE', WFA_FEMALE],
    ['WFA_MALE', WFA_MALE],
    ['LHFA_FEMALE', LHFA_FEMALE],
    ['LHFA_MALE', LHFA_MALE],
    ['BFA_FEMALE', BFA_FEMALE],
    ['BFA_MALE', BFA_MALE],
    ['WFL_FEMALE', WFL_FEMALE],
    ['WFL_MALE', WFL_MALE],
    ['WFH_FEMALE', WFH_FEMALE],
    ['WFH_MALE', WFH_MALE],
    ['WFLH_FEMALE', WFLH_FEMALE],
    ['WFLH_MALE', WFLH_MALE],
  ];

  for (const [tableName, rows] of tables) {
    it(`recovers z = -3, -2, 0, +2, +3 across all ${rows.length} rows of ${tableName}`, () => {
      for (const row of rows) {
        expect(measurementFromZScore(0, row.l, row.m, row.s)).toBeCloseTo(row.m, 10);
        for (const z of Z_CURVES) {
          const x = measurementFromZScore(z, row.l, row.m, row.s);
          expect(calculateZScore(x, row.l, row.m, row.s)).toBeCloseTo(z, 9);
        }
      }
    });
  }
});
