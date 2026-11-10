import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AlertStatusSchema,
  IndicatorSchema,
  OriginSchema,
  PositionSchema,
  RiskSchema,
  SexSchema,
  SpecialtySchema,
  UserRoleSchema,
} from '../index.js';

const schemaPath = fileURLToPath(
  new URL('../../../../apps/api/prisma/schema.prisma', import.meta.url),
);
const prismaSource = readFileSync(schemaPath, 'utf8');

function prismaEnumValues(name: string): string[] {
  const match = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(prismaSource);
  if (!match?.[1]) throw new Error(`Enum ${name} no encontrado en schema.prisma`);
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

describe('paridad de enums con schema.prisma', () => {
  const cases = [
    ['Sex', SexSchema],
    ['Indicator', IndicatorSchema],
    ['Position', PositionSchema],
    ['Origin', OriginSchema],
    ['Risk', RiskSchema],
    ['AlertStatus', AlertStatusSchema],
  ] as const;

  it.each(cases)('%s coincide con la base de datos', (name, schema) => {
    expect([...schema.options]).toEqual(prismaEnumValues(name));
  });
});

describe('enums compartidos', () => {
  it('aceptan sus valores y rechazan otros', () => {
    expect(SexSchema.safeParse('FEMALE').success).toBe(true);
    expect(SexSchema.safeParse('female').success).toBe(false);
    expect(IndicatorSchema.safeParse('BMI_FOR_AGE').success).toBe(true);
    expect(PositionSchema.safeParse('SITTING').success).toBe(false);
    expect(OriginSchema.safeParse('PROFESSIONAL').success).toBe(true);
    expect(RiskSchema.safeParse('NORMAL').success).toBe(false);
    expect(AlertStatusSchema.safeParse('CLOSED').success).toBe(false);
  });

  it('UserRole y Specialty tienen los valores esperados', () => {
    expect(UserRoleSchema.options).toEqual(['CAREGIVER', 'PROFESSIONAL']);
    expect(SpecialtySchema.options).toEqual(['nursing', 'nutrition', 'pediatrics']);
  });
});
