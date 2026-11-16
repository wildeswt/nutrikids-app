import { describe, expect, it } from 'vitest';
import { ageInMonths } from './age.js';

describe('ageInMonths', () => {
  it('calculates exact birthday as exact completed months', () => {
    expect(ageInMonths('2023-01-15', '2024-01-15')).toBe(12);
  });

  it('calculates one day before completed month', () => {
    expect(ageInMonths('2023-01-15', '2024-01-14')).toBe(11);
  });

  it('calculates same day as 0 months', () => {
    expect(ageInMonths('2024-05-10', '2024-05-10')).toBe(0);
  });

  it('calculates correctly across year transitions', () => {
    expect(ageInMonths('2021-11-20', '2024-02-25')).toBe(27);
  });

  it('handles month-end birth dates', () => {
    expect(ageInMonths('2024-01-31', '2024-02-29')).toBe(0);
    expect(ageInMonths('2024-01-31', '2024-03-31')).toBe(2);
  });

  it('accepts UTC Date instances', () => {
    expect(ageInMonths(new Date(Date.UTC(2023, 0, 15)), new Date(Date.UTC(2024, 6, 15)))).toBe(18);
  });

  it('throws when checkup date precedes birth date', () => {
    expect(() => ageInMonths('2024-01-02', '2024-01-01')).toThrow(RangeError);
  });

  it('rejects invalid dates', () => {
    expect(() => ageInMonths('2024-02-30', '2024-03-01')).toThrow(RangeError);
    expect(() => ageInMonths('invalid-date', '2024-03-01')).toThrow(RangeError);
    expect(() => ageInMonths(new Date('invalid'), '2024-03-01')).toThrow(RangeError);
  });
});
