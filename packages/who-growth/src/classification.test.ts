import { describe, expect, it } from 'vitest';
import { RISK_CATEGORIES, classify } from './classification.js';

describe('weight-for-length/height boundaries', () => {
  it.each([
    [-3.0, 'WASTING'],
    [-3.01, 'SEVERE_WASTING'],
    [-2.01, 'WASTING'],
    [-2.0, 'NORMAL'],
    [2.0, 'NORMAL'],
    [2.01, 'OVERWEIGHT'],
  ] as const)('zWFLH = %f -> %s', (zWFLH, expected) => {
    expect(classify({ zWFLH }).primary).toBe(expected);
  });

  it('severe acute wasting has priority over moderate wasting (only outputs severe)', () => {
    const r = classify({ zWFLH: -3.5 });
    expect(r.categories).toEqual(['SEVERE_WASTING']);
  });
});

describe('length/height-for-age boundaries', () => {
  it.each([
    [-3.0, 'STUNTING'],
    [-3.01, 'SEVERE_STUNTING'],
    [-2.01, 'STUNTING'],
    [-2.0, 'NORMAL'],
    [2.01, 'NORMAL'],
  ] as const)('zLHFA = %f -> %s', (zLHFA, expected) => {
    expect(classify({ zLHFA }).primary).toBe(expected);
  });
});

describe('weight-for-age boundaries', () => {
  it.each([
    [-3.0, 'UNDERWEIGHT'],
    [-3.01, 'SEVERE_UNDERWEIGHT'],
    [-2.01, 'UNDERWEIGHT'],
    [-2.0, 'NORMAL'],
  ] as const)('zWFA = %f -> %s', (zWFA, expected) => {
    expect(classify({ zWFA }).primary).toBe(expected);
  });
});

describe('BMI-for-age boundaries', () => {
  it.each([
    [1.0, ['NORMAL']],
    [1.01, ['OVERWEIGHT_RISK']],
    [2.0, ['OVERWEIGHT_RISK']],
    [3.0, ['OVERWEIGHT_RISK']],
    [3.01, ['OBESITY', 'OVERWEIGHT_RISK']],
  ] as const)('zBFA = %f (default WFLH criterion)', (zBFA, expected) => {
    expect(classify({ zBFA }).categories).toEqual(expected);
  });
});

describe('configurable overweight criterion', () => {
  it('by default BMI/E > +2 does NOT trigger overweight (WFLH does)', () => {
    expect(classify({ zBFA: 2.5 }).categories).not.toContain('OVERWEIGHT');
    expect(classify({ zWFLH: 2.5 }).hasAlert).toBe(true);
  });

  it("overweightCriterion 'BFA': only BMI/E > +2 triggers overweight", () => {
    const cutoffs = { overweightCriterion: 'BFA' } as const;
    expect(classify({ zBFA: 2.0 }, cutoffs).categories).not.toContain('OVERWEIGHT');
    expect(classify({ zBFA: 2.01 }, cutoffs).categories).toContain('OVERWEIGHT');
    expect(classify({ zWFLH: 2.5 }, cutoffs).categories).toEqual(['NORMAL']);
  });

  it("overweightCriterion 'both': either indicator triggers overweight", () => {
    const cutoffs = { overweightCriterion: 'both' } as const;
    expect(classify({ zWFLH: 2.5 }, cutoffs).categories).toContain('OVERWEIGHT');
    expect(classify({ zBFA: 2.5 }, cutoffs).categories).toContain('OVERWEIGHT');
    expect(classify({ zWFLH: 1, zBFA: 1 }, cutoffs).categories).toEqual(['NORMAL']);
  });
});

describe('combinations and priority order', () => {
  it('returns all applicable categories ordered by clinical priority', () => {
    const r = classify({ zWFLH: -3.2, zLHFA: -2.5, zWFA: -3.1 });
    expect(r.categories).toEqual(['SEVERE_WASTING', 'SEVERE_UNDERWEIGHT', 'STUNTING']);
    expect(r.primary).toBe('SEVERE_WASTING');
    expect(r.hasAlert).toBe(true);
  });

  it('empty data or all normal -> NORMAL with hasAlert: false', () => {
    expect(classify({})).toEqual({ categories: ['NORMAL'], primary: 'NORMAL', hasAlert: false });
    expect(classify({ zWFA: 0, zLHFA: 0, zWFLH: 0, zBFA: 0 }).hasAlert).toBe(false);
  });

  it('ignores null or non-finite z-scores', () => {
    expect(classify({ zWFLH: null, zLHFA: NaN }).primary).toBe('NORMAL');
  });

  it('supports custom cutoffs', () => {
    expect(classify({ zWFLH: -1.6 }, { wastingWFLH: -1.5 }).primary).toBe('WASTING');
    expect(classify({ zWFLH: -2.5 }, { severeWastingWFLH: -2.4 }).primary).toBe('SEVERE_WASTING');
  });

  it('RISK_CATEGORIES covers all 10 unique classifications', () => {
    expect(new Set(RISK_CATEGORIES).size).toBe(10);
  });
});
