import { describe, expect, it } from 'vitest';
import {
  CreateFollowUpInputSchema,
  FOLLOW_UP_DETAILS_MAX,
  FOLLOW_UP_TYPES,
  FollowUpResponseSchema,
} from '../index.js';

const valid = {
  id: '6f1c1d3e-8b2a-4c6d-9e0f-1a2b3c4d5e6f',
  type: 'recommendation',
  details: 'Aumentar consumo de proteínas',
};

describe('CreateFollowUpInputSchema', () => {
  it.each(FOLLOW_UP_TYPES)('acepta el tipo %s', (type) => {
    expect(CreateFollowUpInputSchema.safeParse({ ...valid, type }).success).toBe(true);
  });

  it('acepta próximo control y alerta opcionales', () => {
    const parsed = CreateFollowUpInputSchema.parse({
      ...valid,
      nextCheckupDate: '2026-12-01',
      alertId: '0b6a1f2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    });
    expect(parsed.nextCheckupDate).toBe('2026-12-01');
  });

  it('recorta el detalle', () => {
    expect(CreateFollowUpInputSchema.parse({ ...valid, details: '  ok  ' }).details).toBe('ok');
  });

  it.each([
    ['tipo desconocido', { ...valid, type: 'diagnosis' }],
    ['detalle vacío', { ...valid, details: '   ' }],
    ['detalle demasiado largo', { ...valid, details: 'x'.repeat(FOLLOW_UP_DETAILS_MAX + 1) }],
    ['fecha con hora', { ...valid, nextCheckupDate: '2026-12-01T10:00:00Z' }],
    ['alerta no UUID', { ...valid, alertId: 'abc' }],
    ['id ausente', { type: valid.type, details: valid.details }],
    ['campo extra', { ...valid, professionalId: valid.id }],
  ])('rechaza %s', (_label, input) => {
    expect(CreateFollowUpInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('FollowUpResponseSchema', () => {
  it('admite seguimiento sin alerta ni recordatorio', () => {
    expect(
      FollowUpResponseSchema.safeParse({
        ...valid,
        childId: valid.id,
        professionalId: valid.id,
        alertId: null,
        nextCheckupDate: null,
        reminder: null,
      }).success,
    ).toBe(true);
  });
});
