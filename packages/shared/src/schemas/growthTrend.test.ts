import { describe, expect, it } from 'vitest';
import {
  GrowthTrendItemSchema,
  GrowthTrendParamsSchema,
  GrowthTrendResponseSchema,
  GrowthTrendValueSchema,
} from './growthTrend.js';

describe('GrowthTrend schemas (NK-74)', () => {
  const validItem = {
    indicator: 'WEIGHT_FOR_AGE' as const,
    trend: 'FAVORABLE' as const,
    basedOnCheckupId: '11111111-1111-4111-8111-111111111111',
  };

  it('validates a single growth trend item', () => {
    const parsed = GrowthTrendItemSchema.safeParse(validItem);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.indicator).toBe('WEIGHT_FOR_AGE');
      expect(parsed.data.trend).toBe('FAVORABLE');
      expect(parsed.data.basedOnCheckupId).toBe('11111111-1111-4111-8111-111111111111');
    }
  });

  it('accepts NONE as trend value', () => {
    const parsed = GrowthTrendValueSchema.safeParse('NONE');
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe('NONE');
    }
  });

  it('rejects invalid trend values', () => {
    expect(GrowthTrendValueSchema.safeParse('UNFAVORABLE').success).toBe(false);
    expect(GrowthTrendValueSchema.safeParse('BAD').success).toBe(false);
    expect(GrowthTrendValueSchema.safeParse('NORMAL').success).toBe(false);
  });

  it('rejects invalid basedOnCheckupId (non-uuid)', () => {
    const parsed = GrowthTrendItemSchema.safeParse({
      ...validItem,
      basedOnCheckupId: 'not-a-uuid',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown indicator', () => {
    const parsed = GrowthTrendItemSchema.safeParse({
      ...validItem,
      indicator: 'UNKNOWN_INDICATOR',
    });
    expect(parsed.success).toBe(false);
  });

  it('validates a response array with multiple indicators', () => {
    const response = [
      validItem,
      {
        indicator: 'LENGTH_HEIGHT_FOR_AGE' as const,
        trend: 'NONE' as const,
        basedOnCheckupId: '11111111-1111-4111-8111-111111111111',
      },
    ];
    const parsed = GrowthTrendResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(2);
    }
  });

  it('validates an empty response array', () => {
    const parsed = GrowthTrendResponseSchema.safeParse([]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual([]);
    }
  });

  it('validates route params', () => {
    expect(
      GrowthTrendParamsSchema.safeParse({
        childId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);

    expect(
      GrowthTrendParamsSchema.safeParse({
        childId: 'invalid',
      }).success,
    ).toBe(false);
  });
});
