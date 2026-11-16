import { MEAL_OPTIONS, type MealId } from './feeding-form.js';

export interface ParsedFeedingDetails {
  /** Comidas reconocidas (ids) en el orden guardado. */
  meals: MealId[];
  /** Texto libre; incluye las comidas no reconocidas si el formato es otro. */
  text: string;
}

const MEALS_PREFIX = /^Comidas:\s*([^.]*)\.\s*/;

/**
 * Descompone `details` (`Comidas: Desayuno, Cena. texto libre`, ver `buildFeedingDetails`)
 * en las comidas marcadas y el texto libre. Si no sigue ese formato, todo es texto libre.
 */
export function parseFeedingDetails(details: string | null): ParsedFeedingDetails {
  if (!details) return { meals: [], text: '' };
  const match = MEALS_PREFIX.exec(details);
  if (!match) return { meals: [], text: details.trim() };

  const meals = (match[1] ?? '')
    .split(',')
    .map((label) => MEAL_OPTIONS.find((option) => option.label === label.trim())?.id)
    .filter((id): id is MealId => id !== undefined);
  return { meals, text: details.slice(match[0].length).trim() };
}

/** Días calendario entre dos fechas `AAAA-MM-DD` (0 = mismo día). */
export function daysBetween(laterIso: string, earlierIso: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((toUtc(laterIso) - toUtc(earlierIso)) / 86_400_000);
}
