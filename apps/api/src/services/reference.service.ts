/**
 * Service that generates the 5 z-score reference curves (-3, -2, 0, +2, +3) from
 * WHO 2006 reference tables using the inverse relationship `measurementFromZScore` (RF-10, RT-08).
 *
 * For each indicator and sex, iterates over all x values of the corresponding table,
 * retrieves LMS parameters and computes the anthropometric measurement for each z level.
 */

import {
  BFA_FEMALE,
  BFA_MALE,
  LHFA_FEMALE,
  LHFA_MALE,
  WFA_FEMALE,
  WFA_MALE,
  WFH_FEMALE,
  WFH_MALE,
  WFL_FEMALE,
  WFL_MALE,
  WHO_REFERENCE_VERSION,
  Z_CURVES,
  getLmsParameters,
  zScoreCurves,
  type MeasurementPosition,
  type WhoIndicator,
  type WhoSex,
} from '@nutrikids/who-growth';
import type {
  OmsCurvePoint,
  OmsReferenceCurvesQuery,
  OmsReferenceCurvesResponse,
} from '@nutrikids/shared';

/** Curve key map (string) to numeric z value. */
const CURVE_KEYS = ['-3', '-2', '0', '+2', '+3'] as const;
type CurveKey = (typeof CURVE_KEYS)[number];

/** Maps API query position to who-growth MeasurementPosition. */
function mapPosition(position?: string): MeasurementPosition | undefined {
  if (position === 'RECUMBENT') return 'recumbent';
  if (position === 'STANDING') return 'standing';
  return undefined;
}

/**
 * Returns all x values (chart axis) from the WHO table corresponding to indicator, sex, and position.
 * For WEIGHT_FOR_LENGTH_HEIGHT without explicit position, merges WFL and WFH in a single sorted x-axis (45-120 cm).
 */
function getXValues(
  indicator: string,
  sex: string,
  measurementPosition?: MeasurementPosition,
): number[] {
  if (indicator === 'WEIGHT_FOR_LENGTH_HEIGHT') {
    if (measurementPosition === 'recumbent') {
      return (sex === 'FEMALE' ? WFL_FEMALE : WFL_MALE).map((f) => f.x);
    }
    if (measurementPosition === 'standing') {
      return (sex === 'FEMALE' ? WFH_FEMALE : WFH_MALE).map((f) => f.x);
    }
    // Without explicit position: sorted union of WFL and WFH
    const xWfl = (sex === 'FEMALE' ? WFL_FEMALE : WFL_MALE).map((f) => f.x);
    const xWfh = (sex === 'FEMALE' ? WFH_FEMALE : WFH_MALE).map((f) => f.x);
    return [...new Set([...xWfl, ...xWfh])].sort((a, b) => a - b);
  }

  if (indicator === 'WEIGHT_FOR_AGE') {
    return (sex === 'FEMALE' ? WFA_FEMALE : WFA_MALE).map((f) => f.x);
  }
  if (indicator === 'LENGTH_HEIGHT_FOR_AGE') {
    return (sex === 'FEMALE' ? LHFA_FEMALE : LHFA_MALE).map((f) => f.x);
  }
  // BMI_FOR_AGE
  return (sex === 'FEMALE' ? BFA_FEMALE : BFA_MALE).map((f) => f.x);
}

/**
 * Determines X-axis label to include in the response.
 * Allows client to know whether the axis is age (months) or height/length (cm).
 */
function determineXAxis(
  indicator: string,
  measurementPosition?: MeasurementPosition,
): OmsReferenceCurvesResponse['xAxis'] {
  if (indicator !== 'WEIGHT_FOR_LENGTH_HEIGHT') return 'age_months';
  return measurementPosition === 'standing' ? 'height_cm' : 'length_cm';
}

/**
 * Calculates the 5 WHO reference curve series for an indicator and sex.
 *
 * RF-10 / RT-08 implementation:
 * - Uses `getLmsParameters` to obtain L, M, S parameters for each row.
 * - Uses `zScoreCurves` (internally calling `measurementFromZScore`) to calculate
 *   the anthropometric measurement corresponding to each z-score.
 * - Response includes `version` to satisfy RT-08.
 */
export function calculateReferenceCurves(
  query: OmsReferenceCurvesQuery,
): OmsReferenceCurvesResponse {
  const { indicator, sex, position } = query;
  const measurementPosition = mapPosition(position);

  const xValues = getXValues(indicator, sex, measurementPosition);
  const xAxis = determineXAxis(indicator, measurementPosition);

  const series: Record<CurveKey, OmsCurvePoint[]> = {
    '-3': [],
    '-2': [],
    '0': [],
    '+2': [],
    '+3': [],
  };

  for (const x of xValues) {
    try {
      const { l, m, s } = getLmsParameters(
        indicator as WhoIndicator,
        sex as WhoSex,
        x,
        measurementPosition,
      );

      const vals = zScoreCurves(l, m, s);

      // Z_CURVES = [-3, -2, 0, 2, 3]; CURVE_KEYS = ['-3', '-2', '0', '+2', '+3']
      Z_CURVES.forEach((z, i) => {
        const key = CURVE_KEYS[i]!;
        series[key].push({ x, y: Math.round(vals[z] * 1000) / 1000 });
      });
    } catch {
      // Point out of range - omitted (can occur in WFL/WFH overlapping range)
    }
  }

  return {
    version: WHO_REFERENCE_VERSION,
    indicator,
    sex,
    xAxis,
    curves: series,
  };
}
