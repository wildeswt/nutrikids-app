import type { AlertResponse } from '@nutrikids/shared';

export const CHILD_ID = '11111111-1111-4111-8111-111111111111';

export function makeAlert(overrides: Partial<AlertResponse> = {}): AlertResponse {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    childId: CHILD_ID,
    checkupId: '33333333-3333-4333-8333-333333333333',
    indicatorResultId: '44444444-4444-4444-8444-444444444444',
    indicator: 'WEIGHT_FOR_AGE',
    zScore: -3.4,
    classification: 'SEVERE_UNDERWEIGHT',
    riskType: 'UNDERWEIGHT',
    isSevere: true,
    reason: 'Peso muy bajo para la edad',
    status: 'PENDING_REVIEW',
    createdAt: '2026-11-10T08:00:00.000Z',
    reviewDueAt: '2026-11-12T08:00:00.000Z',
    isOverdue: false,
    checkupIsCurrent: true,
    ...overrides,
  };
}
