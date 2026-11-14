import type { CheckupRecorder } from '@nutrikids/shared';
import { describe, expect, it } from 'vitest';
import { formatCheckupRecorder } from '../lib/checkup-recorder.js';

describe('formatCheckupRecorder (NK-73)', () => {
  const translations: Record<string, string> = {
    'common:specialties.pediatrics': 'Pediatría',
    'common:specialties.nutrition': 'Nutrición',
    'common:specialties.nursing': 'Enfermería',
    'caregiver:evolution.origin.CAREGIVER': 'Tú',
    'caregiver:evolution.origin.PROFESSIONAL': 'Equipo de salud',
  };

  const t = (key: string, options?: Record<string, unknown>) => {
    return translations[key] ?? (options?.defaultValue as string | undefined) ?? key;
  };

  const proRecorder: CheckupRecorder = {
    userId: '11111111-1111-4111-8111-111111111111',
    firstName: 'Ana',
    lastName: 'Juárez',
    role: 'PROFESSIONAL',
    specialty: 'pediatrics',
  };

  const caregiverRecorder: CheckupRecorder = {
    userId: '22222222-2222-4222-8222-222222222222',
    firstName: 'María',
    lastName: 'López',
    role: 'CAREGIVER',
    specialty: null,
  };

  it('formats professional recorder with name and specialty without assuming gender (no Dra./Dr.)', () => {
    const text = formatCheckupRecorder({
      recorder: proRecorder,
      origin: 'PROFESSIONAL',
      currentUserId: 'different-user',
      t,
    });
    expect(text).toBe('Ana Juárez · Pediatría');
    expect(text).not.toContain('Dra.');
    expect(text).not.toContain('Dr.');
  });

  it('formats caregiver recorder with name and without specialty', () => {
    const text = formatCheckupRecorder({
      recorder: caregiverRecorder,
      origin: 'CAREGIVER',
      currentUserId: 'different-user',
      t,
    });
    expect(text).toBe('María López');
  });

  it('returns "Tú" when recordedBy is the current user (caregiver)', () => {
    const text = formatCheckupRecorder({
      recorder: caregiverRecorder,
      origin: 'CAREGIVER',
      currentUserId: caregiverRecorder.userId,
      t,
    });
    expect(text).toBe('Tú');
  });

  it('returns "Tú" when recordedBy is the current user (professional)', () => {
    const text = formatCheckupRecorder({
      recorder: proRecorder,
      origin: 'PROFESSIONAL',
      currentUserId: proRecorder.userId,
      t,
    });
    expect(text).toBe('Tú');
  });

  it('falls back to "Equipo de salud" when recorder is null and origin is PROFESSIONAL', () => {
    const text = formatCheckupRecorder({
      recorder: null,
      origin: 'PROFESSIONAL',
      currentUserId: 'different-user',
      t,
    });
    expect(text).toBe('Equipo de salud');
  });

  it('falls back to "Tú" when recorder is null and origin is CAREGIVER', () => {
    const text = formatCheckupRecorder({
      recorder: null,
      origin: 'CAREGIVER',
      currentUserId: 'different-user',
      t,
    });
    expect(text).toBe('Tú');
  });

  it('works with Quechua translations', () => {
    const quTranslations: Record<string, string> = {
      'common:specialties.pediatrics': 'Wawa hampi',
      'caregiver:evolution.origin.CAREGIVER': 'Kikin',
      'caregiver:evolution.origin.PROFESSIONAL': 'Hampik tantanakuy',
    };
    const tQu = (key: string, options?: Record<string, unknown>) => {
      return quTranslations[key] ?? (options?.defaultValue as string | undefined) ?? key;
    };

    expect(
      formatCheckupRecorder({
        recorder: proRecorder,
        origin: 'PROFESSIONAL',
        currentUserId: 'different-user',
        t: tQu,
      }),
    ).toBe('Ana Juárez · Wawa hampi');

    expect(
      formatCheckupRecorder({
        recorder: caregiverRecorder,
        origin: 'CAREGIVER',
        currentUserId: caregiverRecorder.userId,
        t: tQu,
      }),
    ).toBe('Kikin');

    expect(
      formatCheckupRecorder({
        recorder: null,
        origin: 'PROFESSIONAL',
        currentUserId: 'different-user',
        t: tQu,
      }),
    ).toBe('Hampik tantanakuy');

    expect(
      formatCheckupRecorder({
        recorder: null,
        origin: 'CAREGIVER',
        currentUserId: 'different-user',
        t: tQu,
      }),
    ).toBe('Kikin');
  });
});
