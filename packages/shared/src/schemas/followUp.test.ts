import { describe, expect, it } from 'vitest';
import {
  CreateFollowUpBatchInputSchema,
  CreateFollowUpInputSchema,
  FollowUpBatchResponseSchema,
  FollowUpResponseSchema,
} from './followUp.js';

describe('Follow-up batch and group schemas (NK-75)', () => {
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

  it('CreateFollowUpInputSchema acepta groupId opcional', () => {
    const res = CreateFollowUpInputSchema.safeParse({
      id: item1.id,
      groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: item1.type,
      details: item1.details,
    });
    expect(res.success).toBe(true);
  });

  it('CreateFollowUpBatchInputSchema valida lote de 1 a 3 ítems con tipos distintos', () => {
    expect(
      CreateFollowUpBatchInputSchema.safeParse({
        items: [item1, item2, item3],
      }).success,
    ).toBe(true);

    expect(
      CreateFollowUpBatchInputSchema.safeParse({
        items: [item1, { ...item2, type: 'observation' }],
      }).success,
    ).toBe(false);
  });

  it('FollowUpResponseSchema incluye groupId string o null', () => {
    const base = {
      id: item1.id,
      childId: '88888888-8888-4888-8888-888888888888',
      groupId: '99999999-9999-4999-8999-999999999999',
      alertId: null,
      professionalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'observation' as const,
      details: item1.details,
      nextCheckupDate: null,
      reminder: null,
    };
    expect(FollowUpResponseSchema.safeParse(base).success).toBe(true);
    expect(FollowUpResponseSchema.safeParse({ ...base, groupId: null }).success).toBe(true);
    expect(FollowUpBatchResponseSchema.safeParse([base]).success).toBe(true);
  });
});
