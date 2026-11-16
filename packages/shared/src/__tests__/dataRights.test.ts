import { describe, expect, it } from 'vitest';
import {
  AuditActionSchema,
  AuditEntityTypeSchema,
  ERASURE_LEGAL_DEADLINE_DAYS,
  ErasureRequestParamsSchema,
  ErasureRequestStatusSchema,
  RectifyChildInputSchema,
} from '../index.js';

const id = '3f1c0f9e-6a53-4f0e-9a64-0d3a3d3c6b11';

describe('esquemas de derechos del representante', () => {
  it('RectifyChildInputSchema exige al menos un campo y rechaza campos ajenos', () => {
    expect(RectifyChildInputSchema.safeParse({}).success).toBe(false);
    expect(RectifyChildInputSchema.safeParse({ firstName: 'Mateo' }).success).toBe(true);
    expect(
      RectifyChildInputSchema.safeParse({ birthDate: '2024-02-01', sex: 'FEMALE' }).success,
    ).toBe(true);
    expect(RectifyChildInputSchema.safeParse({ firstName: '   ' }).success).toBe(false);
    expect(RectifyChildInputSchema.safeParse({ birthDate: '01/02/2024' }).success).toBe(false);
    expect(RectifyChildInputSchema.safeParse({ id }).success).toBe(false);
  });

  it('define estados de solicitud y el plazo legal de 15 días', () => {
    expect(ErasureRequestStatusSchema.safeParse('pending').success).toBe(true);
    expect(ErasureRequestStatusSchema.safeParse('done').success).toBe(false);
    expect(ERASURE_LEGAL_DEADLINE_DAYS).toBe(15);
    expect(ErasureRequestParamsSchema.safeParse({ childId: id, requestId: id }).success).toBe(true);
    expect(ErasureRequestParamsSchema.safeParse({ childId: id, requestId: 'x' }).success).toBe(
      false,
    );
  });

  it('la auditoría admite las acciones y la entidad nuevas', () => {
    for (const action of ['UPDATE', 'EXPORT', 'ERASE']) {
      expect(AuditActionSchema.safeParse(action).success).toBe(true);
    }
    expect(AuditEntityTypeSchema.safeParse('erasure_requests').success).toBe(true);
  });
});
