import {
  CreateCheckupInputSchema,
  LENGTH_HEIGHT_MAX_CM,
  LENGTH_HEIGHT_MIN_CM,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  isPlausibleLengthHeight,
  isPlausibleWeight,
  type CreateCheckupInput,
  type Position,
} from '@nutrikids/shared';
import { generateUuid } from './uuid.js';

export interface CheckupFormData {
  /** Date typed as `DD/MM/AAAA`. */
  dateText: string;
  weightText: string;
  heightText: string;
  position: Position;
}

/** Why the form cannot be sent; each code maps to a message in `caregiver:addCheckup.errors`. */
export type CheckupFormError =
  | { code: 'dateRequired' }
  | { code: 'dateInvalid' }
  | { code: 'dateFuture' }
  | { code: 'dateBeforeBirth' }
  | { code: 'weightRange'; min: number; max: number }
  | { code: 'heightRange'; min: number; max: number }
  /** Valid but atypical values: the caregiver must confirm them (`confirmOutlier`). */
  | { code: 'outlier' }
  | { code: 'invalid' };

export type CheckupFormResult =
  { ok: true; input: CreateCheckupInput } | { ok: false; error: CheckupFormError };

export function parseDecimalInput(raw: string): number {
  return Number.parseFloat(raw.trim().replace(',', '.'));
}

/** `YYYY-MM-DD` of the local calendar day of a date. */
export function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Formats a date as `DD/MM/AAAA` using its local calendar day. */
export function formatDateInput(date: Date): string {
  const [year, month, day] = toLocalIsoDate(date).split('-');
  return `${day}/${month}/${year}`;
}

/** Parses `DD/MM/AAAA` (also `-` or `.` separators) into `YYYY-MM-DD`, or `null` if not a real date. */
export function parseDateInput(raw: string): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * ISO instant stored as `measuredAt`. Today uses the current time (a fixed hour could be in the
 * future for the API); other days use noon UTC, which is the same calendar day in every timezone
 * of the Americas.
 */
export function measuredAtFromIsoDate(isoDate: string, now: Date = new Date()): string {
  return isoDate === toLocalIsoDate(now) ? now.toISOString() : `${isoDate}T12:00:00.000Z`;
}

/**
 * Validates the form and builds the `CreateCheckupInput` sent to the API. Atypical (but possible)
 * values return the `outlier` error until `confirmOutlier` is true, then they are sent flagged.
 */
export function buildCreateCheckupInput(
  form: CheckupFormData,
  options: { birthDate: string; confirmOutlier: boolean; now?: Date; id?: string },
): CheckupFormResult {
  const now = options.now ?? new Date();

  if (!form.dateText.trim()) return { ok: false, error: { code: 'dateRequired' } };
  const isoDate = parseDateInput(form.dateText);
  if (!isoDate) return { ok: false, error: { code: 'dateInvalid' } };
  if (isoDate > toLocalIsoDate(now)) return { ok: false, error: { code: 'dateFuture' } };
  if (isoDate < options.birthDate) return { ok: false, error: { code: 'dateBeforeBirth' } };

  const weightKg = parseDecimalInput(form.weightText);
  if (Number.isNaN(weightKg) || weightKg < WEIGHT_MIN_KG || weightKg > WEIGHT_MAX_KG) {
    return { ok: false, error: { code: 'weightRange', min: WEIGHT_MIN_KG, max: WEIGHT_MAX_KG } };
  }

  const lengthHeightCm = parseDecimalInput(form.heightText);
  if (
    Number.isNaN(lengthHeightCm) ||
    lengthHeightCm < LENGTH_HEIGHT_MIN_CM ||
    lengthHeightCm > LENGTH_HEIGHT_MAX_CM
  ) {
    return {
      ok: false,
      error: { code: 'heightRange', min: LENGTH_HEIGHT_MIN_CM, max: LENGTH_HEIGHT_MAX_CM },
    };
  }

  const isOutlier = !isPlausibleWeight(weightKg) || !isPlausibleLengthHeight(lengthHeightCm);
  if (isOutlier && !options.confirmOutlier) return { ok: false, error: { code: 'outlier' } };

  const parsed = CreateCheckupInputSchema.safeParse({
    id: options.id ?? generateUuid(),
    measuredAt: measuredAtFromIsoDate(isoDate, now),
    weightKg,
    lengthHeightCm,
    position: form.position,
    ...(isOutlier ? { confirmOutlier: true } : {}),
  });

  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, error: { code: 'invalid' } };
}
