import { FEEDING_DETAILS_MAX, MEALS_PER_DAY_MAX, MEALS_PER_DAY_MIN } from '@nutrikids/shared';
import { describe, expect, it } from 'vitest';
import {
  buildCreateFeedingLogInput,
  buildFeedingDetails,
  clampMealsPerDay,
  stepMealsPerDay,
  toLocalIsoDate,
  toggleMealSelection,
} from '../lib/feeding-form.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FIXED_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date(2026, 9, 18, 14, 30, 0); // 18 de octubre de 2026, hora local

describe('feeding-form', () => {
  describe('toLocalIsoDate', () => {
    it('formats the local calendar date as YYYY-MM-DD', () => {
      expect(toLocalIsoDate(NOW)).toBe('2026-10-18');
      expect(toLocalIsoDate(new Date(2026, 0, 5, 23, 55, 0))).toBe('2026-01-05');
    });
  });

  describe('meal checkboxes and mealsPerDay counter', () => {
    it('syncs mealsPerDay with the number of checked meals and preserves canonical order', () => {
      let state = toggleMealSelection([], 'dinner');
      expect(state).toEqual({ selectedMeals: ['dinner'], mealsPerDay: 1 });

      state = toggleMealSelection(state.selectedMeals, 'breakfast');
      expect(state).toEqual({ selectedMeals: ['breakfast', 'dinner'], mealsPerDay: 2 });

      state = toggleMealSelection(state.selectedMeals, 'lunch');
      expect(state).toEqual({
        selectedMeals: ['breakfast', 'lunch', 'dinner'],
        mealsPerDay: 3,
      });

      state = toggleMealSelection(state.selectedMeals, 'lunch');
      expect(state).toEqual({ selectedMeals: ['breakfast', 'dinner'], mealsPerDay: 2 });
    });

    it('clamps and steps mealsPerDay within 0–12', () => {
      expect(MEALS_PER_DAY_MIN).toBe(0);
      expect(MEALS_PER_DAY_MAX).toBe(12);

      expect(stepMealsPerDay(0, -1)).toBe(0);
      expect(stepMealsPerDay(0, 1)).toBe(1);
      expect(stepMealsPerDay(12, 1)).toBe(12);
      expect(stepMealsPerDay(12, -1)).toBe(11);
      expect(clampMealsPerDay(-5)).toBe(0);
      expect(clampMealsPerDay(99)).toBe(12);
    });
  });

  describe('buildFeedingDetails', () => {
    it('omits details when no meals are checked and free text is empty or whitespace', () => {
      expect(buildFeedingDetails([], '')).toEqual({ details: undefined, truncated: false });
      expect(buildFeedingDetails([], '   \n\t  ')).toEqual({
        details: undefined,
        truncated: false,
      });
    });

    it('formats checked meals in Spanish without free text', () => {
      expect(buildFeedingDetails(['dinner', 'breakfast', 'lunch'], '   ')).toEqual({
        details: 'Comidas: Desayuno, Almuerzo, Cena.',
        truncated: false,
      });
    });

    it('uses trimmed free text alone when no meals are checked', () => {
      expect(buildFeedingDetails([], '  Arroz con pollo y jugo de naranja  ')).toEqual({
        details: 'Arroz con pollo y jugo de naranja',
        truncated: false,
      });
    });

    it('combines checked meals and trimmed free text', () => {
      expect(
        buildFeedingDetails(['breakfast', 'morningSnack', 'lunch'], '  Sopa de verduras  '),
      ).toEqual({
        details: 'Comidas: Desayuno, Merienda am, Almuerzo. Sopa de verduras',
        truncated: false,
      });
    });

    it('truncates only the free text (never the meal list) when exceeding 500 characters', () => {
      const longNotes = 'A'.repeat(490);
      const result = buildFeedingDetails(['breakfast', 'lunch', 'dinner'], longNotes);

      expect(result.truncated).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details!.length).toBe(FEEDING_DETAILS_MAX);
      expect(result.details!.startsWith('Comidas: Desayuno, Almuerzo, Cena. ')).toBe(true);
    });

    it('truncates free text alone to 500 characters and reports truncation', () => {
      const longNotes = 'B'.repeat(520);
      const result = buildFeedingDetails([], longNotes);

      expect(result).toEqual({
        details: 'B'.repeat(FEEDING_DETAILS_MAX),
        truncated: true,
      });
    });
  });

  describe('buildCreateFeedingLogInput', () => {
    it('builds a valid payload with local today date, client id and combined details', () => {
      const result = buildCreateFeedingLogInput(
        {
          selectedMeals: ['breakfast', 'lunch'],
          mealsPerDay: 3,
          freeText: '  Fruta picada  ',
        },
        { now: NOW, id: FIXED_ID },
      );

      expect(result).toEqual({
        ok: true,
        detailsTruncated: false,
        input: {
          id: FIXED_ID,
          logDate: '2026-10-18',
          mealsPerDay: 3,
          details: 'Comidas: Desayuno, Almuerzo. Fruta picada',
        },
      });
    });

    it('omits details when nothing was written or checked and generates a UUID if missing', () => {
      const result = buildCreateFeedingLogInput(
        {
          selectedMeals: [],
          mealsPerDay: 0,
          freeText: '',
        },
        { now: NOW },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.input.id).toMatch(UUID_V4);
        expect(result.input.logDate).toBe('2026-10-18');
        expect(result.input.mealsPerDay).toBe(0);
        expect('details' in result.input).toBe(false);
      }
    });
  });
});
