import {
  CreateFeedingLogInputSchema,
  FEEDING_DETAILS_MAX,
  MEALS_PER_DAY_MAX,
  MEALS_PER_DAY_MIN,
  type CreateFeedingLogInput,
} from '@nutrikids/shared';
import { generateUuid } from './uuid.js';

export type MealId = 'breakfast' | 'morningSnack' | 'lunch' | 'afternoonSnack' | 'dinner';

export interface MealOption {
  id: MealId;
  /** Nombre en español usado al armar `details` para la API. */
  label: string;
}

export const MEAL_OPTIONS: readonly MealOption[] = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'morningSnack', label: 'Merienda am' },
  { id: 'lunch', label: 'Almuerzo' },
  { id: 'afternoonSnack', label: 'Merienda pm' },
  { id: 'dinner', label: 'Cena' },
] as const;

export interface FeedingFormData {
  selectedMeals: readonly MealId[];
  mealsPerDay: number;
  freeText: string;
}

export interface FeedingDetailsResult {
  details: string | undefined;
  truncated: boolean;
}

export type FeedingFormResult =
  | { ok: true; input: CreateFeedingLogInput; detailsTruncated: boolean }
  | { ok: false; error: { code: 'invalid' } };

/** Fecha calendario local en formato `AAAA-MM-DD`. */
export function toLocalIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Limita la cantidad de comidas al rango permitido por la API (0–12). */
export function clampMealsPerDay(value: number): number {
  return Math.min(MEALS_PER_DAY_MAX, Math.max(MEALS_PER_DAY_MIN, Math.round(value)));
}

/**
 * Alterna una comida y sincroniza el contador al total de casillas marcadas,
 * manteniendo el orden canónico de las comidas.
 */
export function toggleMealSelection(
  current: readonly MealId[],
  mealId: MealId,
): { selectedMeals: MealId[]; mealsPerDay: number } {
  const nextSet = new Set(current);
  if (nextSet.has(mealId)) {
    nextSet.delete(mealId);
  } else {
    nextSet.add(mealId);
  }

  const selectedMeals = MEAL_OPTIONS.filter((option) => nextSet.has(option.id)).map(
    (option) => option.id,
  );

  return {
    selectedMeals,
    mealsPerDay: clampMealsPerDay(selectedMeals.length),
  };
}

/** Ajusta manualmente el contador de comidas en +1 o -1 dentro de los límites 0–12. */
export function stepMealsPerDay(current: number, delta: -1 | 1): number {
  return clampMealsPerDay(current + delta);
}

/**
 * Arma `details` como `Comidas: <lista>. <texto libre>` recortado al máximo permitido.
 * Si no hay comidas marcadas ni texto, omite `details`; si supera `maxLength`, recorta solo
 * el texto libre (nunca la lista de comidas) e indica `truncated: true`.
 */
export function buildFeedingDetails(
  selectedMeals: readonly MealId[],
  freeText: string,
  maxLength: number = FEEDING_DETAILS_MAX,
): FeedingDetailsResult {
  const selectedSet = new Set(selectedMeals);
  const mealLabels = MEAL_OPTIONS.filter((option) => selectedSet.has(option.id)).map(
    (option) => option.label,
  );
  const trimmedText = freeText.trim();

  if (mealLabels.length === 0 && trimmedText.length === 0) {
    return { details: undefined, truncated: false };
  }

  if (mealLabels.length === 0) {
    if (trimmedText.length <= maxLength) {
      return { details: trimmedText, truncated: false };
    }
    return {
      details: trimmedText.slice(0, maxLength).trimEnd(),
      truncated: true,
    };
  }

  const prefixBase = `Comidas: ${mealLabels.join(', ')}.`;
  if (trimmedText.length === 0) {
    return { details: prefixBase, truncated: false };
  }

  const prefix = `${prefixBase} `;
  const combined = `${prefix}${trimmedText}`;
  if (combined.length <= maxLength) {
    return { details: combined, truncated: false };
  }

  const availableForText = Math.max(0, maxLength - prefix.length);
  const clippedText = trimmedText.slice(0, availableForText).trimEnd();
  return {
    details: clippedText.length > 0 ? `${prefix}${clippedText}` : prefixBase,
    truncated: true,
  };
}

/**
 * Construye y valida el cuerpo `CreateFeedingLogInput` con la fecha local de hoy
 * y un UUID reutilizable para reintentos idempotentes.
 */
export function buildCreateFeedingLogInput(
  form: FeedingFormData,
  options: { now?: Date; id?: string } = {},
): FeedingFormResult {
  const now = options.now ?? new Date();
  const { details, truncated } = buildFeedingDetails(form.selectedMeals, form.freeText);

  const parsed = CreateFeedingLogInputSchema.safeParse({
    id: options.id ?? generateUuid(),
    logDate: toLocalIsoDate(now),
    mealsPerDay: form.mealsPerDay,
    ...(details !== undefined ? { details } : {}),
  });

  return parsed.success
    ? { ok: true, input: parsed.data, detailsTruncated: truncated }
    : { ok: false, error: { code: 'invalid' } };
}
