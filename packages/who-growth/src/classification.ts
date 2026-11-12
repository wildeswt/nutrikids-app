/**
 * Nutritional status classification based on WHO z-scores.
 * All boundary comparisons are strict: z = -2.00 is NOT wasting and z = +2.00 is NOT overweight.
 */

export const RISK_CATEGORIES = [
  'SEVERE_WASTING',
  'SEVERE_STUNTING',
  'SEVERE_UNDERWEIGHT',
  'WASTING',
  'STUNTING',
  'UNDERWEIGHT',
  'OBESITY',
  'OVERWEIGHT',
  'OVERWEIGHT_RISK',
  'NORMAL',
] as const;

/** Risk category values. Array order denotes priority (first item is most critical). */
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/**
 * Criterion determining which indicator generates the `OVERWEIGHT` classification:
 * - `'WFLH'`: Weight-for-length/height > +2 (solution section of project specification). Default value.
 * - `'BFA'`: BMI-for-age > +2 (theoretical framework).
 * - `'both'`: either indicator exceeds +2.
 */
export type OverweightCriterion = 'WFLH' | 'BFA' | 'both';

export interface Cutoffs {
  /** WFLH < value -> severe acute wasting (highest priority). */
  severeWastingWFLH: number;
  /** WFLH < value -> wasting. */
  wastingWFLH: number;
  /** WFA < value -> severe underweight. */
  severeUnderweightWFA: number;
  /** WFA < value -> underweight. */
  underweightWFA: number;
  /** LHFA < value -> severe stunting. */
  severeStuntingLHFA: number;
  /** LHFA < value -> stunting. */
  stuntingLHFA: number;
  /** WFLH > value -> overweight (if criterion includes 'WFLH'). */
  overweightWFLH: number;
  /** BFA > value -> overweight (if criterion includes 'BFA'). */
  overweightBFA: number;
  /** BFA > value -> overweight risk. */
  overweightRiskBFA: number;
  /** BFA > value -> obesity. */
  obesityBFA: number;
  /** Criterion that triggers overweight. */
  overweightCriterion: OverweightCriterion;
}

export const DEFAULT_CUTOFFS: Readonly<Cutoffs> = Object.freeze({
  severeWastingWFLH: -3,
  wastingWFLH: -2,
  severeUnderweightWFA: -3,
  underweightWFA: -2,
  severeStuntingLHFA: -3,
  stuntingLHFA: -2,
  overweightWFLH: 2,
  overweightBFA: 2,
  overweightRiskBFA: 1,
  obesityBFA: 3,
  overweightCriterion: 'WFLH',
});

/** Available z-scores; uncalculated indicators are omitted or null. */
export interface ZScores {
  /** Weight for age. */
  zWFA?: number | null;
  /** Length/height for age. */
  zLHFA?: number | null;
  /** Weight for length/height. */
  zWFLH?: number | null;
  /** BMI for age. */
  zBFA?: number | null;
}

export interface Classification {
  /** All applicable categories, sorted from highest to lowest priority; ['NORMAL'] if none. */
  categories: RiskCategory[];
  /** Highest priority category. */
  primary: RiskCategory;
  /** true if primary is not 'NORMAL' (indicates actionable alert). */
  hasAlert: boolean;
}

function isDefined(z: number | null | undefined): z is number {
  return typeof z === 'number' && Number.isFinite(z);
}

export function classify(zs: ZScores, cutoffs: Partial<Cutoffs> = {}): Classification {
  const c: Cutoffs = { ...DEFAULT_CUTOFFS, ...cutoffs };
  const { zWFA, zLHFA, zWFLH, zBFA } = zs;
  const found = new Set<RiskCategory>();

  if (isDefined(zWFLH)) {
    if (zWFLH < c.severeWastingWFLH) found.add('SEVERE_WASTING');
    else if (zWFLH < c.wastingWFLH) found.add('WASTING');
  }
  if (isDefined(zWFA)) {
    if (zWFA < c.severeUnderweightWFA) found.add('SEVERE_UNDERWEIGHT');
    else if (zWFA < c.underweightWFA) found.add('UNDERWEIGHT');
  }
  if (isDefined(zLHFA)) {
    if (zLHFA < c.severeStuntingLHFA) found.add('SEVERE_STUNTING');
    else if (zLHFA < c.stuntingLHFA) found.add('STUNTING');
  }

  const overweightByWflh =
    c.overweightCriterion !== 'BFA' && isDefined(zWFLH) && zWFLH > c.overweightWFLH;
  const overweightByBfa =
    c.overweightCriterion !== 'WFLH' && isDefined(zBFA) && zBFA > c.overweightBFA;
  if (overweightByWflh || overweightByBfa) found.add('OVERWEIGHT');

  if (isDefined(zBFA)) {
    if (zBFA > c.obesityBFA) found.add('OBESITY');
    if (zBFA > c.overweightRiskBFA) found.add('OVERWEIGHT_RISK');
  }

  const categories = RISK_CATEGORIES.filter((r) => found.has(r));
  if (categories.length === 0) categories.push('NORMAL');
  const primary = categories[0] ?? 'NORMAL';
  return { categories, primary, hasAlert: primary !== 'NORMAL' };
}
