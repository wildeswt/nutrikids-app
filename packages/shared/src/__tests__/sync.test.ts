import { describe, expect, it } from 'vitest';
import {
  AuditActionSchema,
  SYNC_MAX_BATCH_SIZE,
  SyncCheckupItemSchema,
  SyncCheckupResultSchema,
  SyncCheckupsInputSchema,
} from '../index.js';

const item = {
  id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
  childId: '8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  measuredAt: '2026-10-18T14:30:00-05:00',
  weightKg: 12.2,
  lengthHeightCm: 97.0,
  position: 'STANDING',
};

describe('SyncCheckupItemSchema', () => {
  it('acepta un control con childId y resultados opcionales del celular', () => {
    const parsed = SyncCheckupItemSchema.safeParse({
      ...item,
      results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: -0.5, classification: 'NORMAL' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('exige childId', () => {
    const { childId: _omit, ...rest } = item;
    expect(SyncCheckupItemSchema.safeParse(rest).success).toBe(false);
  });

  it('exige confirmOutlier para medidas atípicas', () => {
    expect(SyncCheckupItemSchema.safeParse({ ...item, weightKg: 35 }).success).toBe(false);
    expect(
      SyncCheckupItemSchema.safeParse({ ...item, weightKg: 35, confirmOutlier: true }).success,
    ).toBe(true);
  });

  it('rechaza campos desconocidos', () => {
    expect(SyncCheckupItemSchema.safeParse({ ...item, origin: 'PROFESSIONAL' }).success).toBe(
      false,
    );
  });
});

describe('SyncCheckupsInputSchema', () => {
  it('no valida los ítems individualmente (se validan en el servidor)', () => {
    expect(SyncCheckupsInputSchema.safeParse({ checkups: [item, { foo: 1 }] }).success).toBe(true);
  });

  it('rechaza un lote vacío o que excede el máximo', () => {
    expect(SyncCheckupsInputSchema.safeParse({ checkups: [] }).success).toBe(false);
    expect(
      SyncCheckupsInputSchema.safeParse({
        checkups: Array.from({ length: SYNC_MAX_BATCH_SIZE + 1 }, () => item),
      }).success,
    ).toBe(false);
  });
});

describe('SyncCheckupResultSchema', () => {
  it('acepta un ítem con error y sin control', () => {
    expect(
      SyncCheckupResultSchema.safeParse({
        id: null,
        status: 'ERROR',
        error: { status: 400, message: 'inválido' },
      }).success,
    ).toBe(true);
  });

  it('acepta discrepancias por indicador', () => {
    expect(
      SyncCheckupResultSchema.safeParse({
        id: item.id,
        status: 'CREATED',
        discrepancies: [{ indicator: 'BMI_FOR_AGE', fields: ['zScore', 'classification'] }],
      }).success,
    ).toBe(true);
  });
});

describe('AuditActionSchema', () => {
  it('incluye DISCREPANCY', () => {
    expect(AuditActionSchema.safeParse('DISCREPANCY').success).toBe(true);
  });
});
