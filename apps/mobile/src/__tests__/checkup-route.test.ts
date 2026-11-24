import { Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearInMemoryCheckupEvaluations,
  parseCheckupSavedParams,
  toCheckupSavedParams,
} from '../lib/checkup-route.js';
import type { LocalWhoEvaluation } from '../lib/checkup-form.js';

const child = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Valentina',
  birthDate: '2023-06-15',
};

const checkup = {
  measuredAt: '2026-11-10T15:00:00.000Z',
  weightKg: 13.4,
  lengthHeightCm: 91.5,
  position: 'RECUMBENT' as const,
};

describe('checkup-saved route params', () => {
  it('flattens the API checkup into string params and rebuilds it', () => {
    const params = toCheckupSavedParams(child, checkup);

    expect(Object.values(params).every((value) => typeof value === 'string')).toBe(true);
    expect(parseCheckupSavedParams(params)).toEqual({
      childId: child.id,
      childName: 'Valentina',
      birthDate: '2023-06-15',
      measuredAt: checkup.measuredAt,
      weightKg: 13.4,
      lengthHeightCm: 91.5,
      position: 'RECUMBENT',
    });
  });

  it('accepts array params as expo-router may give them', () => {
    const params = toCheckupSavedParams(child, checkup);
    const asArrays = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, [v]]));

    expect(parseCheckupSavedParams(asArrays)?.weightKg).toBe(13.4);
  });

  it('returns null when the screen is opened without the checkup', () => {
    expect(parseCheckupSavedParams({})).toBeNull();
  });

  it('returns null when a value is not valid', () => {
    const params = toCheckupSavedParams(child, checkup);

    expect(parseCheckupSavedParams({ ...params, weightKg: 'pesado' })).toBeNull();
    expect(parseCheckupSavedParams({ ...params, position: 'SITTING' })).toBeNull();
  });

  describe('web privacy (no WHO z-scores in URL params)', () => {
    const originalOS = Platform.OS;

    afterEach(() => {
      Platform.OS = originalOS;
      clearInMemoryCheckupEvaluations();
      vi.unstubAllEnvs();
    });

    it('keeps localEvaluation in memory behind evalKey on web runtime and clears on sign-out', () => {
      Platform.OS = 'web';
      vi.stubEnv('NODE_ENV', 'production');

      const evaluation: LocalWhoEvaluation = {
        primary: 'NORMAL',
        hasAlert: false,
        results: [
          {
            indicator: 'WEIGHT_FOR_AGE',
            zScore: 0.25,
            percentile: 59.87,
            classification: 'NORMAL',
          },
        ],
      };

      const params = toCheckupSavedParams(child, checkup, {
        localEvaluation: evaluation,
        roleMode: 'PROFESSIONAL',
      });

      expect(params['localEvaluation']).toBeUndefined();
      expect(params['evalKey']).toBeTypeOf('string');
      expect(parseCheckupSavedParams(params)?.localEvaluation).toEqual(evaluation);

      clearInMemoryCheckupEvaluations();
      expect(parseCheckupSavedParams(params)?.localEvaluation).toBeUndefined();
    });
  });
});
