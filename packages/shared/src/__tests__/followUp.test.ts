import { describe, expect, it } from 'vitest';
import {
  CreateFollowUpBatchInputSchema,
  CreateFollowUpInputSchema,
  FOLLOW_UP_DETAILS_MAX,
  FOLLOW_UP_TYPES,
  FollowUpBatchResponseSchema,
  FollowUpResponseSchema,
} from '../index.js';

const valid = {
  id: '6f1c1d3e-8b2a-4c6d-9e0f-1a2b3c4d5e6f',
  type: 'recommendation',
  details: 'Aumentar consumo de proteínas',
};

const item1 = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'observation' as const,
  details: 'Observación clínica del estado nutricional',
};

const item2 = {
  id: '22222222-2222-4222-8222-222222222222',
  type: 'intervention' as const,
  details: 'Suplementación con micronutrientes',
};

const item3 = {
  id: '33333333-3333-4333-8333-333333333333',
  type: 'referral' as const,
  details: 'Derivación a pediatría especializada',
};

describe('CreateFollowUpInputSchema', () => {
  it.each(FOLLOW_UP_TYPES)('acepta el tipo %s', (type) => {
    expect(CreateFollowUpInputSchema.safeParse({ ...valid, type }).success).toBe(true);
  });

  it('acepta próximo control, alerta y groupId opcionales', () => {
    const parsed = CreateFollowUpInputSchema.parse({
      ...valid,
      groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nextCheckupDate: '2026-12-01',
      alertId: '0b6a1f2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    });
    expect(parsed.groupId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(parsed.nextCheckupDate).toBe('2026-12-01');
    expect(parsed.alertId).toBe('0b6a1f2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b');
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
    ['groupId no UUID', { ...valid, groupId: 'invalid-uuid' }],
    ['id ausente', { type: valid.type, details: valid.details }],
    ['campo extra', { ...valid, professionalId: valid.id }],
  ])('rechaza %s', (_label, input) => {
    expect(CreateFollowUpInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('CreateFollowUpBatchInputSchema (NK-75)', () => {
  it('valida un lote con 1 ítem', () => {
    const parsed = CreateFollowUpBatchInputSchema.safeParse({
      items: [item1],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items).toHaveLength(1);
    }
  });

  it('valida un lote con 2 y 3 ítems con tipos distintos', () => {
    const batch2 = CreateFollowUpBatchInputSchema.safeParse({
      items: [item1, item2],
    });
    expect(batch2.success).toBe(true);

    const batch3 = CreateFollowUpBatchInputSchema.safeParse({
      alertId: '44444444-4444-4444-8444-444444444444',
      groupId: '55555555-5555-4555-8555-555555555555',
      nextCheckupDate: '2026-11-28',
      items: [item1, item2, item3],
    });
    expect(batch3.success).toBe(true);
    if (batch3.success) {
      expect(batch3.data.items).toHaveLength(3);
      expect(batch3.data.alertId).toBe('44444444-4444-4444-8444-444444444444');
      expect(batch3.data.groupId).toBe('55555555-5555-4555-8555-555555555555');
      expect(batch3.data.nextCheckupDate).toBe('2026-11-28');
    }
  });

  it('rechaza un lote vacío (min 1)', () => {
    const parsed = CreateFollowUpBatchInputSchema.safeParse({
      items: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza un lote con más de 3 ítems (max 3)', () => {
    const parsed = CreateFollowUpBatchInputSchema.safeParse({
      items: [
        item1,
        item2,
        item3,
        {
          id: '66666666-6666-4666-8666-666666666666',
          type: 'recommendation' as const,
          details: 'Recomendación alimentaria',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza tipos repetidos en el mismo lote', () => {
    const parsed = CreateFollowUpBatchInputSchema.safeParse({
      items: [
        item1,
        {
          id: '77777777-7777-4777-8777-777777777777',
          type: 'observation' as const,
          details: 'Segunda observación repetida',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza ítems con detalles vacíos o excesivamente largos', () => {
    const emptyDetails = CreateFollowUpBatchInputSchema.safeParse({
      items: [{ ...item1, details: '    ' }],
    });
    expect(emptyDetails.success).toBe(false);

    const tooLongDetails = CreateFollowUpBatchInputSchema.safeParse({
      items: [{ ...item1, details: 'a'.repeat(2001) }],
    });
    expect(tooLongDetails.success).toBe(false);
  });
});

describe('FollowUpResponseSchema y FollowUpBatchResponseSchema', () => {
  const baseResponse = {
    id: valid.id,
    childId: valid.id,
    groupId: '99999999-9999-4999-8999-999999999999',
    alertId: null,
    professionalId: valid.id,
    type: 'observation' as const,
    details: 'Control regular',
    nextCheckupDate: null,
    reminder: null,
  };

  it('admite seguimiento con groupId string o null (o ausente con default null)', () => {
    const withGroup = FollowUpResponseSchema.safeParse(baseResponse);
    expect(withGroup.success).toBe(true);
    if (withGroup.success) {
      expect(withGroup.data.groupId).toBe('99999999-9999-4999-8999-999999999999');
    }

    const withNull = FollowUpResponseSchema.safeParse({
      ...baseResponse,
      groupId: null,
    });
    expect(withNull.success).toBe(true);
    if (withNull.success) {
      expect(withNull.data.groupId).toBeNull();
    }

    const withoutField = FollowUpResponseSchema.safeParse({
      id: valid.id,
      childId: valid.id,
      alertId: null,
      professionalId: valid.id,
      type: 'observation',
      details: 'Control regular',
      nextCheckupDate: null,
      reminder: null,
    });
    expect(withoutField.success).toBe(true);
    if (withoutField.success) {
      expect(withoutField.data.groupId).toBeNull();
    }
  });

  it('valida FollowUpBatchResponseSchema como array de respuestas', () => {
    const parsed = FollowUpBatchResponseSchema.safeParse([
      baseResponse,
      {
        ...baseResponse,
        id: item2.id,
        type: 'intervention',
        details: item2.details,
      },
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0]!.groupId).toBe(baseResponse.groupId);
    }
  });
});
