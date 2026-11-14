import { describe, expect, it } from 'vitest';
import {
  CreateFeedingLogInputSchema,
  FEEDING_DETAILS_MAX,
  FEEDING_LOGS_DEFAULT_LIMIT,
  ListFeedingLogsQuerySchema,
} from '../index.js';

const valid = {
  id: '6f1c1d3e-8b2a-4c6d-9e0f-1a2b3c4d5e6f',
  logDate: '2026-11-10',
  mealsPerDay: 4,
};

describe('CreateFeedingLogInputSchema', () => {
  it('acepta un registro sin detalle y recorta el detalle', () => {
    expect(CreateFeedingLogInputSchema.safeParse(valid).success).toBe(true);
    expect(CreateFeedingLogInputSchema.parse({ ...valid, details: '  sopa  ' }).details).toBe(
      'sopa',
    );
  });

  it.each([0, 12])('acepta %i comidas', (mealsPerDay) => {
    expect(CreateFeedingLogInputSchema.safeParse({ ...valid, mealsPerDay }).success).toBe(true);
  });

  it.each([
    ['13 comidas', { mealsPerDay: 13 }],
    ['comidas negativas', { mealsPerDay: -1 }],
    ['comidas decimales', { mealsPerDay: 1.5 }],
    ['comidas como texto', { mealsPerDay: '3' }],
    ['fecha con hora', { logDate: '2026-11-10T10:00:00Z' }],
    ['detalle vacío', { details: ' ' }],
    ['detalle largo', { details: 'x'.repeat(FEEDING_DETAILS_MAX + 1) }],
    ['campo extra', { childId: valid.id }],
  ])('rechaza: %s', (_name, overrides) => {
    expect(CreateFeedingLogInputSchema.safeParse({ ...valid, ...overrides }).success).toBe(false);
  });
});

describe('ListFeedingLogsQuerySchema', () => {
  it('usa el límite por defecto y convierte el texto en número', () => {
    expect(ListFeedingLogsQuerySchema.parse({}).limit).toBe(FEEDING_LOGS_DEFAULT_LIMIT);
    expect(ListFeedingLogsQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('rechaza límites y fechas inválidos', () => {
    expect(ListFeedingLogsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(ListFeedingLogsQuerySchema.safeParse({ from: 'ayer' }).success).toBe(false);
  });
});
