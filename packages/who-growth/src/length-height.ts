/** WHO correction between length (recumbent) and height (standing), in cm. */
export const LENGTH_HEIGHT_CORRECTION_CM = 0.7;

export type MeasurementPosition = 'recumbent' | 'standing';

/**
 * Adjusts a measurement to the position expected by the reference table.
 * Recumbent length is 0.7 cm greater than standing height.
 *
 * @param valueCm Measured value in centimeters
 * @param measuredIn Position in which the child was measured
 * @param tableIn Position expected by the LMS reference table
 */
export function adjustLengthHeight(
  valueCm: number,
  measuredIn: MeasurementPosition,
  tableIn: MeasurementPosition,
): number {
  if (!Number.isFinite(valueCm) || valueCm <= 0) {
    throw new RangeError('valueCm must be a positive finite number');
  }
  if (measuredIn === tableIn) return valueCm;
  const adjusted =
    measuredIn === 'standing'
      ? valueCm + LENGTH_HEIGHT_CORRECTION_CM
      : valueCm - LENGTH_HEIGHT_CORRECTION_CM;
  // Round to 1 decimal place to eliminate floating point artifacts (e.g. 97.0 + 0.7 = 97.7)
  return Math.round(adjusted * 10) / 10;
}
