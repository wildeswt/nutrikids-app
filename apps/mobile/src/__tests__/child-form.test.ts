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
  relationshipLabel,
  toRelationshipCode,
} from '../lib/child-form.js';
import { CURRENT_CONSENT_VERSION } from '../lib/consent-api.js';

describe('child-form helper', () => {
  it('builds a valid CreateChildInput payload with padded ISO date and active consent version', () => {
    // 24 months old child
    const today = new Date();
    const year = String(today.getFullYear() - 2);

    const formData = {
      firstName: '  Mateo  ',
      lastName: '  Gómez  ',
      birthDay: '5',
      birthMonth: '6',
      birthYear: year,
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
