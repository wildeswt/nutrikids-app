import { CreateChildInputSchema } from '@nutrikids/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import {
  buildCreateChildPayload,
  evaluateChildBirthDate,
  isoToLocalDate,
  relationshipLabel,
  toRelationshipCode,
} from '../lib/child-form.js';
import { CURRENT_CONSENT_VERSION } from '../lib/consent-api.js';

describe('child-form helper', () => {
  it('builds a valid CreateChildInput payload from DD/MM/AAAA date and active consent version', () => {
    // 24 months old child
    const today = new Date();
    const year = String(today.getFullYear() - 2);

    const formData = {
      firstName: '  Mateo  ',
      lastName: '  Gómez  ',
      birthDateText: `05/06/${year}`,
      sex: 'MALE' as const,
      relationship: 'FATHER' as const,
      isLegalRepresentative: true,
    };

    const payload = buildCreateChildPayload(formData);

    expect(payload).toEqual({
      firstName: 'Mateo',
      lastName: 'Gómez',
      birthDate: `${year}-06-05`,
      sex: 'MALE',
      relationship: 'FATHER',
      isLegalRepresentative: true,
      consentTextVersion: CURRENT_CONSENT_VERSION,
    });

    // Validates successfully against the official schema
    const parsed = CreateChildInputSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('evaluates birth date validity, future dates, and OMS age range (12-60 months)', () => {
    const ref = '2026-11-14';

    expect(evaluateChildBirthDate('', ref)).toEqual({ kind: 'empty' });
    expect(evaluateChildBirthDate('31/02/2023', ref)).toEqual({ kind: 'invalid' });
    expect(evaluateChildBirthDate('12/05', ref)).toEqual({ kind: 'invalid' });
    expect(evaluateChildBirthDate('15/11/2026', ref)).toEqual({
      kind: 'future',
      isoDate: '2026-11-15',
    });
    expect(evaluateChildBirthDate('14/05/2026', ref)).toEqual({
      kind: 'outOfRange',
      isoDate: '2026-05-14',
      months: 6,
    });
    expect(evaluateChildBirthDate('14/11/2020', ref)).toEqual({
      kind: 'outOfRange',
      isoDate: '2020-11-14',
      months: 72,
    });
    expect(evaluateChildBirthDate('15/06/2023', ref)).toEqual({
      kind: 'valid',
      isoDate: '2023-06-15',
      months: 40,
    });
  });

  it('parses ISO dates into local calendar Date objects', () => {
    const date = isoToLocalDate('2023-05-12');
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(12);
    expect(isoToLocalDate('2023-02-31')).toBeNull();
    expect(isoToLocalDate('12/05/2023')).toBeNull();
  });

  it('maps relationship codes and legacy Spanish values to a translated label', () => {
    expect(toRelationshipCode('MOTHER')).toBe('MOTHER');
    expect(toRelationshipCode('madre')).toBe('MOTHER');
    expect(toRelationshipCode('Padre')).toBe('FATHER');
    expect(toRelationshipCode(' Tutor Legal ')).toBe('LEGAL_GUARDIAN');
    expect(toRelationshipCode('Abuela')).toBeNull();

    expect(relationshipLabel('LEGAL_GUARDIAN')).toBe('Tutor legal');
    expect(relationshipLabel('madre')).toBe('Madre');
    expect(relationshipLabel('Abuela')).toBe('Abuela');
  });
});
