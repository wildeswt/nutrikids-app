import { z } from 'zod';
import { IndicatorSchema, SexSchema, PositionSchema } from './enums.js';

// Validation messages in Spanish for end users (NK-15, RT-10).
z.config(z.locales.es());

/** Query params for GET /reference/curves. */
export const OmsReferenceCurvesQuerySchema = z.strictObject({
  indicator: IndicatorSchema,
  sex: SexSchema,
  /**
   * Only relevant for `WEIGHT_FOR_LENGTH_HEIGHT`.
   * If omitted, WHO convention applies (< 87 cm recumbent, >= 87 cm standing).
   */
  position: PositionSchema.optional(),
});

export type OmsReferenceCurvesQuery = z.infer<typeof OmsReferenceCurvesQuerySchema>;

/** A point (x, y) on a reference growth curve. */
export const OmsCurvePointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type OmsCurvePoint = z.infer<typeof OmsCurvePointSchema>;

/** Response payload for GET /reference/curves. */
export const OmsReferenceCurvesResponseSchema = z.object({
  /** WHO reference tables version (RT-08). */
  version: z.literal('WHO 2006'),
  indicator: IndicatorSchema,
  sex: SexSchema,
  /**
   * X-axis unit:
   * - `'age_months'` for Weight-for-age, Length/height-for-age, and BMI-for-age.
   * - `'length_cm'` for Weight-for-length (WFL).
   * - `'height_cm'` for Weight-for-height (WFH).
   */
  xAxis: z.enum(['age_months', 'length_cm', 'height_cm']),
  /** The 5 z-score series (-3, -2, 0, +2, +3), ready for charting. */
  curves: z.object({
    '-3': z.array(OmsCurvePointSchema),
    '-2': z.array(OmsCurvePointSchema),
    '0': z.array(OmsCurvePointSchema),
    '+2': z.array(OmsCurvePointSchema),
    '+3': z.array(OmsCurvePointSchema),
  }),
});

export type OmsReferenceCurvesResponse = z.infer<typeof OmsReferenceCurvesResponseSchema>;

export const ReferenceCurvesQuerySchema = OmsReferenceCurvesQuerySchema;
export const CurvePointSchema = OmsCurvePointSchema;
export const ReferenceCurvesResponseSchema = OmsReferenceCurvesResponseSchema;

export type ReferenceCurvesQuery = OmsReferenceCurvesQuery;
export type CurvePoint = OmsCurvePoint;
export type ReferenceCurvesResponse = OmsReferenceCurvesResponse;
