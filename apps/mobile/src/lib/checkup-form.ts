import {
  CHECKUP_NOTES_MAX,
  CreateCheckupInputSchema,
  LENGTH_HEIGHT_MAX_CM,
  LENGTH_HEIGHT_MIN_CM,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  isPlausibleLengthHeight,
  isPlausibleWeight,
  type CreateCheckupInput,
  type Indicator,
  type Position,
  type Sex,
} from '@nutrikids/shared';
import {
  ageInMonths,
  adjustLengthHeight,
  calculateZScore,
  classify,
  getLmsParameters,
  percentileFromZScore,
  type MeasurementPosition,
  type RiskCategory,
  type WhoIndicator,
} from '@nutrikids/who-growth';
import { generateUuid } from './uuid.js';

export interface CheckupFormData {
  /** Date typed as `DD/MM/AAAA`. */
  dateText: string;
  weightText: string;
  heightText: string;
  position: Position;
  notesText?: string;
}

/** Why the form cannot be sent; each code maps to a message in `caregiver:addCheckup.errors`. */
export type CheckupFormError =
  | { code: 'dateRequired' }
  | { code: 'dateInvalid' }
  | { code: 'dateFuture' }
  | { code: 'dateBeforeBirth' }
  | { code: 'weightRange'; min: number; max: number }
  | { code: 'heightRange'; min: number; max: number }
  | { code: 'notesTooLong'; max: number }
  /** Valid but atypical values: the caregiver must confirm them (`confirmOutlier`). */
  | { code: 'outlier'; field: 'weight' | 'height' | 'both'; value: string }
  | { code: 'invalid' };

export interface LocalWhoResult {
  indicator: Indicator;
  zScore: number;
  percentile: number;
  classification: RiskCategory;
}

export interface LocalWhoEvaluation {
  results: LocalWhoResult[];
  primary: RiskCategory;
  hasAlert: boolean;
}

export type CheckupFormResult =
  | { ok: true; input: CreateCheckupInput; localEvaluation: LocalWhoEvaluation | null }
  | { ok: false; error: CheckupFormError };

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Computes the 4 WHO growth indicators locally using `@nutrikids/who-growth`.
 * Returns `null` if the measurement or age falls outside the WHO reference tables.
 */
export function calculateLocalWhoResults(params: {
  sex: Sex;
  birthDate: string;
  measuredAt: string;
  weightKg: number;
  lengthHeightCm: number;
  position: Position;
}): LocalWhoEvaluation | null {
  try {
    const position: MeasurementPosition =
      params.position === 'RECUMBENT' ? 'recumbent' : 'standing';
    const ageMonths = ageInMonths(params.birthDate, params.measuredAt);

    const z = (ind: WhoIndicator, x: number, value: number, pos?: MeasurementPosition): number => {
      const { l, m, s } = getLmsParameters(ind, params.sex, x, pos);
      return round2(calculateZScore(value, l, m, s));
    };

    const tableLhfa: MeasurementPosition = ageMonths < 24 ? 'recumbent' : 'standing';
    const lhfaValue = adjustLengthHeight(params.lengthHeightCm, position, tableLhfa);
    const wflX = Math.round(params.lengthHeightCm * 2) / 2;
    const bmi = params.weightKg / (params.lengthHeightCm / 100) ** 2;

    const zs = {
      WEIGHT_FOR_AGE: z('WEIGHT_FOR_AGE', ageMonths, params.weightKg),
      LENGTH_HEIGHT_FOR_AGE: z('LENGTH_HEIGHT_FOR_AGE', ageMonths, lhfaValue),
      WEIGHT_FOR_LENGTH_HEIGHT: z('WEIGHT_FOR_LENGTH_HEIGHT', wflX, params.weightKg, position),
      BMI_FOR_AGE: z('BMI_FOR_AGE', ageMonths, bmi),
    } as const;

    const overall = classify({
      zWFA: zs.WEIGHT_FOR_AGE,
      zLHFA: zs.LENGTH_HEIGHT_FOR_AGE,
      zWFLH: zs.WEIGHT_FOR_LENGTH_HEIGHT,
      zBFA: zs.BMI_FOR_AGE,
    });

    const classOf: Record<Indicator, RiskCategory> = {
      WEIGHT_FOR_AGE: classify({ zWFA: zs.WEIGHT_FOR_AGE }).primary,
      LENGTH_HEIGHT_FOR_AGE: classify({ zLHFA: zs.LENGTH_HEIGHT_FOR_AGE }).primary,
      WEIGHT_FOR_LENGTH_HEIGHT: classify({ zWFLH: zs.WEIGHT_FOR_LENGTH_HEIGHT }).primary,
      BMI_FOR_AGE: classify({ zBFA: zs.BMI_FOR_AGE }).primary,
    };

    const results: LocalWhoResult[] = (Object.keys(zs) as Indicator[]).map((indicator) => ({
      indicator,
      zScore: zs[indicator],
      percentile: round2(percentileFromZScore(zs[indicator])),
      classification: classOf[indicator],
    }));

    return {
      results,
      primary: overall.primary,
      hasAlert: overall.hasAlert,
    };
  } catch {
    return null;
  }
}

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
  options: { birthDate: string; sex?: Sex; confirmOutlier: boolean; now?: Date; id?: string },
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

  const trimmedNotes = form.notesText?.trim() ?? '';
  if (trimmedNotes.length > CHECKUP_NOTES_MAX) {
    return { ok: false, error: { code: 'notesTooLong', max: CHECKUP_NOTES_MAX } };
  }

  const weightOutlier = !isPlausibleWeight(weightKg);
  const heightOutlier = !isPlausibleLengthHeight(lengthHeightCm);
  const isOutlier = weightOutlier || heightOutlier;
  if (isOutlier && !options.confirmOutlier) {
    const field = weightOutlier && heightOutlier ? 'both' : weightOutlier ? 'weight' : 'height';
    const value = weightOutlier ? String(weightKg) : String(lengthHeightCm);
    return { ok: false, error: { code: 'outlier', field, value } };
  }

  const measuredAt = measuredAtFromIsoDate(isoDate, now);
  const localEvaluation = options.sex
    ? calculateLocalWhoResults({
        sex: options.sex,
        birthDate: options.birthDate,
        measuredAt,
        weightKg,
        lengthHeightCm,
        position: form.position,
      })
    : null;

  const parsed = CreateCheckupInputSchema.safeParse({
    id: options.id ?? generateUuid(),
    measuredAt,
    weightKg,
    lengthHeightCm,
    position: form.position,
    ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    ...(isOutlier ? { confirmOutlier: true } : {}),
    ...(localEvaluation ? { results: localEvaluation.results } : {}),
  });

  return parsed.success
    ? { ok: true, input: parsed.data, localEvaluation }
    : { ok: false, error: { code: 'invalid' } };
}
