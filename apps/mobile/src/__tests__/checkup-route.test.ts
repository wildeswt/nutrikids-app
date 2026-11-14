import { describe, expect, it } from 'vitest';
import { parseCheckupSavedParams, toCheckupSavedParams } from '../lib/checkup-route.js';

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
});
