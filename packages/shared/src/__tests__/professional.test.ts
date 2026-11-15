import { describe, expect, it } from 'vitest';
import {
  ProfessionalLookupQuerySchema,
  ProfessionalLookupResponseSchema,
} from '../schemas/professional.js';

describe('ProfessionalLookupQuerySchema', () => {
  it('trims the license and rejects empty or unknown fields', () => {
    expect(ProfessionalLookupQuerySchema.parse({ license: '  AB-123 ' })).toEqual({
      license: 'AB-123',
    });
    expect(ProfessionalLookupQuerySchema.safeParse({ license: '   ' }).success).toBe(false);
    expect(ProfessionalLookupQuerySchema.safeParse({ license: 'A', extra: 1 }).success).toBe(false);
    expect(ProfessionalLookupQuerySchema.safeParse({ license: 'x'.repeat(51) }).success).toBe(
      false,
    );
  });
});

describe('ProfessionalLookupResponseSchema', () => {
  it('does not carry email, phone or license', () => {
    const parsed = ProfessionalLookupResponseSchema.parse({
      professionalId: '22222222-2222-4222-8222-222222222222',
      firstName: 'Laura',
      lastName: 'Pérez',
      specialty: 'nutrition',
      email: 'x@y.z',
    });
    expect(Object.keys(parsed).sort()).toEqual([
      'firstName',
      'lastName',
      'professionalId',
      'specialty',
    ]);
  });
});
