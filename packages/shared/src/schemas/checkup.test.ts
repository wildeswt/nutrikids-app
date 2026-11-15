import { describe, expect, it } from 'vitest';
import {
  CaregiverCheckupResponseSchema,
  CheckupRecorderSchema,
  CheckupResponseSchema,
} from './checkup.js';

describe('CheckupRecorderSchema and checkup response shapes (NK-73)', () => {
  const proRecorder = {
    userId: '11111111-1111-4111-8111-111111111111',
    firstName: 'Ana',
    lastName: 'Juárez',
    role: 'PROFESSIONAL' as const,
    specialty: 'pediatrics',
  };

  const caregiverRecorder = {
    userId: '22222222-2222-4222-8222-222222222222',
    firstName: 'Carlos',
    lastName: 'Gómez',
    role: 'CAREGIVER' as const,
    specialty: null,
  };

  it('validates a professional recorder', () => {
    const parsed = CheckupRecorderSchema.safeParse(proRecorder);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.specialty).toBe('pediatrics');
      expect(parsed.data.role).toBe('PROFESSIONAL');
    }
  });

  it('validates a caregiver recorder with null specialty', () => {
    const parsed = CheckupRecorderSchema.safeParse(caregiverRecorder);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.specialty).toBeNull();
      expect(parsed.data.role).toBe('CAREGIVER');
    }
  });

  it('rejects invalid role or non-uuid', () => {
    expect(
      CheckupRecorderSchema.safeParse({
        ...proRecorder,
        role: 'ADMIN',
      }).success,
    ).toBe(false);

    expect(
      CheckupRecorderSchema.safeParse({
        ...proRecorder,
        userId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  const baseCheckup = {
    id: '33333333-3333-4333-8333-333333333333',
    childId: '44444444-4444-4444-8444-444444444444',
    measuredAt: '2026-11-10T10:00:00.000Z',
    weightKg: 12.5,
    lengthHeightCm: 90,
    position: 'STANDING' as const,
    origin: 'PROFESSIONAL' as const,
    recordedById: proRecorder.userId,
    recordedBy: proRecorder,
    correctedCheckupId: null,
    isCurrent: true,
    notes: 'Control regular',
    createdAt: '2026-11-10T10:05:00.000Z',
  };

  it('validates CaregiverCheckupResponseSchema with recordedBy and with null recordedBy', () => {
    expect(CaregiverCheckupResponseSchema.safeParse(baseCheckup).success).toBe(true);
    expect(
      CaregiverCheckupResponseSchema.safeParse({
        ...baseCheckup,
        recordedBy: null,
      }).success,
    ).toBe(true);
  });

  it('validates CheckupResponseSchema with recordedBy and with null recordedBy', () => {
    const fullCheckup = {
      ...baseCheckup,
      results: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          checkupId: baseCheckup.id,
          indicator: 'WEIGHT_FOR_AGE' as const,
          zScore: 0.15,
          percentile: 55.9,
          classification: 'NORMAL' as const,
          referenceVersion: 'WHO 2006',
        },
      ],
    };
    expect(CheckupResponseSchema.safeParse(fullCheckup).success).toBe(true);
    expect(
      CheckupResponseSchema.safeParse({
        ...fullCheckup,
        recordedBy: null,
      }).success,
    ).toBe(true);
  });
});
