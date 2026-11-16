/**
 * LMS growth parameters according to WHO standards (Cole, 1990).
 */
export interface LmsRow {
  /** X-axis: completed age in months (WFA, LHFA, BFA) or length/height in cm (WFLH). */
  x: number;
  /** Box-Cox skewness parameter (Lambda). */
  l: number;
  /** Median of the reference population (Mu). */
  m: number;
  /** Generalized coefficient of variation (Sigma). */
  s: number;
}
