import { describe, expect, it } from 'vitest';
import {
  AssignProfessionalInputSchema,
  ChildResponseSchema,
  ConsentResponseSchema,
  CreateChildInputSchema,
  EndProfessionalAssignmentInputSchema,
  GrantConsentInputSchema,
  createChildInputSchema,
} from '../index.js';

const TODAY = '2026-10-18';
const schema = createChildInputSchema(() => TODAY);

const child = {
  firstName: 'Mateo',
  lastName: 'Andrade',
  birthDate: '2023-05-12',
  sex: 'MALE',
  relationship: 'madre',
  isLegalRepresentative: true,
};

function withBirth(birthDate: string) {
  return schema.safeParse({ ...child, birthDate });
}

describe('createChildInputSchema (edad 12 a 60 meses)', () => {
  it('acepta a Mateo (nacido el 2023-05-12, 41 meses el 2026-10-18)', () => {
    expect(schema.safeParse(child).success).toBe(true);
  });

  it('límite inferior: 12 meses cumplidos sí, 11 no', () => {
    expect(withBirth('2025-10-18').success).toBe(true);
    const young = withBirth('2025-10-19');
    expect(young.success).toBe(false);
    expect(young.error?.issues[0]?.message).toBe('El niño debe tener entre 12 y 60 meses');
  });

  it('límite superior: 60 meses cumplidos sí, 61 no', () => {
    expect(withBirth('2021-10-18').success).toBe(true);
    expect(withBirth('2021-10-17').success).toBe(true); // 60 meses y 1 día
    expect(withBirth('2021-09-18').success).toBe(false); // 61 meses
  });

  it('rechaza fechas futuras con un mensaje claro', () => {
    const result = withBirth('2026-10-19');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('La fecha de nacimiento no puede ser futura');
  });

  it('rechaza fechas con formato inválido', () => {
    expect(withBirth('12/05/2023').success).toBe(false);
    expect(withBirth('2023-02-30').success).toBe(false);
  });

  it('rechaza sexo desconocido, nombres vacíos y campos extra', () => {
    expect(schema.safeParse({ ...child, sex: 'OTHER' }).success).toBe(false);
    expect(schema.safeParse({ ...child, firstName: ' ' }).success).toBe(false);
    expect(schema.safeParse({ ...child, id: 'x' }).success).toBe(false);
    expect(schema.safeParse({ ...child, address: 'Calle 1' }).success).toBe(false);
  });

  it('CreateChildInputSchema usa la fecha actual como referencia', () => {
    expect(CreateChildInputSchema.safeParse({ ...child, birthDate: '2999-01-01' }).success).toBe(
      false,
    );
  });
});

describe('AssignProfessionalInputSchema', () => {
  const professionalId = '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c';

  it('acepta solo el profesional o con fechas coherentes', () => {
    expect(AssignProfessionalInputSchema.safeParse({ professionalId }).success).toBe(true);
    expect(
      AssignProfessionalInputSchema.safeParse({
        professionalId,
        startDate: '2026-10-01',
        endDate: '2026-10-01',
      }).success,
    ).toBe(true);
  });

  it('rechaza fin anterior al inicio y UUID inválido', () => {
    const result = AssignProfessionalInputSchema.safeParse({
      professionalId,
      startDate: '2026-10-02',
      endDate: '2026-10-01',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'La fecha de fin no puede ser anterior a la de inicio',
    );
    expect(AssignProfessionalInputSchema.safeParse({ professionalId: '1' }).success).toBe(false);
  });

  it('finalizar exige fecha de fin', () => {
    expect(EndProfessionalAssignmentInputSchema.safeParse({ endDate: '2026-10-18' }).success).toBe(
      true,
    );
    expect(EndProfessionalAssignmentInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('consentimiento', () => {
  it('GrantConsentInput exige la versión del texto y rechaza extras', () => {
    expect(GrantConsentInputSchema.safeParse({ textVersion: 'v1.0' }).success).toBe(true);
    expect(GrantConsentInputSchema.safeParse({ textVersion: '' }).success).toBe(false);
    expect(
      GrantConsentInputSchema.safeParse({ textVersion: 'v1.0', grantedById: 'x' }).success,
    ).toBe(false);
  });

  it('ConsentResponse admite consentimiento vigente y revocado', () => {
    const base = {
      id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      childId: '4a2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      grantedById: '5b2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      textVersion: 'v1.0',
      grantedAt: '2026-10-18T14:30:00.000Z',
    };
    expect(ConsentResponseSchema.safeParse({ ...base, revokedAt: null }).success).toBe(true);
    expect(
      ConsentResponseSchema.safeParse({ ...base, revokedAt: '2026-11-01T10:00:00.000Z' }).success,
    ).toBe(true);
  });
});

describe('ChildResponseSchema', () => {
  it('solo expone los datos mínimos del niño', () => {
    expect(Object.keys(ChildResponseSchema.shape).sort()).toEqual([
      'birthDate',
      'firstName',
      'id',
      'lastName',
      'sex',
    ]);
  });
});
