import type { LmsRow } from './tables/types.js';
import { WFA_FEMALE, WFA_MALE } from './tables/wfa.js';
import { LHFA_FEMALE, LHFA_MALE } from './tables/lhfa.js';
import { BFA_FEMALE, BFA_MALE } from './tables/bfa.js';
import { WFL_FEMALE, WFL_MALE } from './tables/wfl.js';
import { WFH_FEMALE, WFH_MALE } from './tables/wfh.js';
import type { MeasurementPosition } from './length-height.js';

export * from './tables/index.js';

/** Official release version of WHO Child Growth Standards. */
export const WHO_REFERENCE_VERSION = 'WHO 2006' as const;
export type WhoReferenceVersion = typeof WHO_REFERENCE_VERSION;

export type WhoIndicator =
  'WEIGHT_FOR_AGE' | 'LENGTH_HEIGHT_FOR_AGE' | 'WEIGHT_FOR_LENGTH_HEIGHT' | 'BMI_FOR_AGE';

export type WhoSex = 'FEMALE' | 'MALE';
export type { MeasurementPosition };

function findInArray(rows: LmsRow[], x: number): LmsRow | undefined {
  const roundedX = Math.round(x * 100) / 100;
  return rows.find((r) => Math.abs(r.x - roundedX) < 0.001);
}

/**
 * Retrieves WHO 2006 LMS growth parameters for a given indicator, sex, and x value.
 *
 * - For `WEIGHT_FOR_AGE`, `LENGTH_HEIGHT_FOR_AGE`, `BMI_FOR_AGE`: `x` is completed age in months (12 to 60).
 * - For `WEIGHT_FOR_LENGTH_HEIGHT`: `x` is length or height in cm (0.5 cm steps).
 *   - If `position` is specified:
 *     - `'recumbent'`: searches length table (WFL, 45 to 110 cm).
 *     - `'standing'`: searches height table (WFH, 65 to 120 cm).
 *   - If position is omitted, defaults by WHO convention (< 87 cm recumbent, >= 87 cm standing).
 *
 * @throws {RangeError} If x is outside table range for the indicator/sex.
 */
export function getLmsParameters(
  indicator: WhoIndicator,
  sex: WhoSex,
  x: number,
  position?: MeasurementPosition,
): LmsRow {
  let rows: LmsRow[] | undefined;

  switch (indicator) {
    case 'WEIGHT_FOR_AGE':
      rows = sex === 'FEMALE' ? WFA_FEMALE : WFA_MALE;
      break;

    case 'LENGTH_HEIGHT_FOR_AGE':
      rows = sex === 'FEMALE' ? LHFA_FEMALE : LHFA_MALE;
      break;

    case 'BMI_FOR_AGE':
      rows = sex === 'FEMALE' ? BFA_FEMALE : BFA_MALE;
      break;

    case 'WEIGHT_FOR_LENGTH_HEIGHT':
      if (position === 'recumbent') {
        rows = sex === 'FEMALE' ? WFL_FEMALE : WFL_MALE;
      } else if (position === 'standing') {
        rows = sex === 'FEMALE' ? WFH_FEMALE : WFH_MALE;
      } else {
        rows =
          x < 87
            ? sex === 'FEMALE'
              ? WFL_FEMALE
              : WFL_MALE
            : sex === 'FEMALE'
              ? WFH_FEMALE
              : WFH_MALE;
      }
      break;

    default:
      throw new RangeError(`Unknown indicator: ${indicator}`);
  }

  const result = findInArray(rows, x);
  if (result) {
    return result;
  }

  // Fallback for WEIGHT_FOR_LENGTH_HEIGHT across overlap interval (65 to 110 cm)
  if (indicator === 'WEIGHT_FOR_LENGTH_HEIGHT') {
    const fallbackRows =
      rows === (sex === 'FEMALE' ? WFL_FEMALE : WFL_MALE)
        ? sex === 'FEMALE'
          ? WFH_FEMALE
          : WFH_MALE
        : sex === 'FEMALE'
          ? WFL_FEMALE
          : WFL_MALE;

    const fallbackResult = findInArray(fallbackRows, x);
    if (fallbackResult) {
      return fallbackResult;
    }
  }

  throw new RangeError(
    `Value x=${x} is out of bounds for indicator ${indicator} (${sex}${position ? `, ${position}` : ''})`,
  );
}
