import { describe, expect, it } from 'vitest';
import { buildFeedingDetails } from '../lib/feeding-form.js';
import { daysBetween, parseFeedingDetails } from '../lib/feeding-history.js';

describe('parseFeedingDetails', () => {
  it('descompone lo que arma buildFeedingDetails', () => {
    const { details } = buildFeedingDetails(['breakfast', 'dinner'], 'Arroz con pollo');
    expect(parseFeedingDetails(details!)).toEqual({
      meals: ['breakfast', 'dinner'],
      text: 'Arroz con pollo',
    });
  });

  it('acepta solo comidas, solo texto o vacío', () => {
    expect(parseFeedingDetails('Comidas: Almuerzo.')).toEqual({ meals: ['lunch'], text: '' });
    expect(parseFeedingDetails('Sopa')).toEqual({ meals: [], text: 'Sopa' });
    expect(parseFeedingDetails(null)).toEqual({ meals: [], text: '' });
  });
});

describe('daysBetween', () => {
  it('cuenta días calendario', () => {
    expect(daysBetween('2026-11-14', '2026-11-13')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(1);
    expect(daysBetween('2026-11-14', '2026-11-14')).toBe(0);
  });
});
