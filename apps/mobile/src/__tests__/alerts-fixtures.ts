import type { AlertDetailResponse, AlertResponse, CheckupResponse } from '@nutrikids/shared';

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

export const CHECKUP_ID = '33333333-3333-4333-8333-333333333333';
export const PROFESSIONAL_ID = '55555555-5555-4555-8555-555555555555';

export function makeDetail(overrides: Partial<AlertDetailResponse> = {}): AlertDetailResponse {
  return {
    ...makeAlert(),
    history: [
      {
        status: 'GENERATED',
        changedById: '66666666-6666-4666-8666-666666666666',
        changedByName: 'Laura Pérez',
        changedAt: '2026-11-10T08:00:00.000Z',
      },
      {
        status: 'PENDING_REVIEW',
        changedById: PROFESSIONAL_ID,
        changedByName: 'Carlos Sánchez',
        changedAt: '2026-11-10T08:00:05.000Z',
      },
    ],
    ...overrides,
  };
}

/** Checkup with the 4 technical results; `z` is the z-score of every indicator. */
export function makeCheckup(overrides: Partial<CheckupResponse> = {}, z = -1): CheckupResponse {
  const id = overrides.id ?? CHECKUP_ID;
  return {
    id,
    childId: CHILD_ID,
    measuredAt: '2026-11-10T08:00:00.000Z',
    weightKg: 12.2,
    lengthHeightCm: 97,
    position: 'STANDING',
    origin: 'PROFESSIONAL',
    recordedById: '66666666-6666-4666-8666-666666666666',
    correctedCheckupId: null,
    isCurrent: true,
    notes: null,
    createdAt: '2026-11-10T08:00:00.000Z',
    results: (
      [
        'WEIGHT_FOR_AGE',
        'LENGTH_HEIGHT_FOR_AGE',
        'WEIGHT_FOR_LENGTH_HEIGHT',
        'BMI_FOR_AGE',
      ] as const
    ).map((indicator, index) => ({
      id: `77777777-7777-4777-8777-77777777777${index}`,
      checkupId: id,
      indicator,
      zScore: z,
      percentile: 20,
      classification: 'NORMAL' as const,
      referenceVersion: 'WHO-2006',
    })),
    ...overrides,
  };
}
