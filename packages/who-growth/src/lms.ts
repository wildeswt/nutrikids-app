/**
 * LMS method (Cole, 1990) for growth z-scores.
 *
 *   z = ((x / M)^L - 1) / (L * S)     if L != 0
 *   z = ln(x / M) / S                 if L == 0
 *
 * Standard Cole LMS formulation without WHO beyond 3 SD scaling.
 * Pure math implementation running identically in Node.js and React Native.
 */

/** Standard reference curves plotted on growth charts. */
export const Z_CURVES = [-3, -2, 0, 2, 3] as const;
export type ZCurve = (typeof Z_CURVES)[number];

function validateLMS(M: number, S: number, L: number): void {
  if (!Number.isFinite(L)) throw new RangeError('L must be a finite number');
  if (!Number.isFinite(M) || M <= 0) throw new RangeError('M must be a positive number');
  if (!Number.isFinite(S) || S <= 0) throw new RangeError('S must be a positive number');
}

/** Calculates z-score for measurement `x` given LMS reference parameters. */
export function calculateZScore(x: number, L: number, M: number, S: number): number {
  validateLMS(M, S, L);
  if (!Number.isFinite(x) || x <= 0) throw new RangeError('x must be a positive number');
  if (L === 0) return Math.log(x / M) / S;
  return (Math.pow(x / M, L) - 1) / (L * S);
}

/** Inverse of `calculateZScore`: returns the measurement value corresponding to a given z-score. */
export function measurementFromZScore(z: number, L: number, M: number, S: number): number {
  validateLMS(M, S, L);
  if (!Number.isFinite(z)) throw new RangeError('z must be a finite number');
  if (L === 0) return M * Math.exp(S * z);
  const base = 1 + L * S * z;
  if (base <= 0) {
    throw new RangeError('z-score is outside the LMS domain for these parameters');
  }
  return M * Math.pow(base, 1 / L);
}

/** Computes measurements for -3, -2, 0, +2 and +3 SD curves to plot growth charts. */
export function zScoreCurves(L: number, M: number, S: number): Record<ZCurve, number> {
  const out = {} as Record<ZCurve, number>;
  for (const z of Z_CURVES) out[z] = measurementFromZScore(z, L, M, S);
  return out;
}

/** High-precision Chebyshev erfc approximation from Numerical Recipes (error < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Percentile (0-100) corresponding to a z-score using standard normal CDF. */
export function percentileFromZScore(z: number): number {
  if (!Number.isFinite(z)) throw new RangeError('z must be a finite number');
  return 50 * erfc(-z / Math.SQRT2);
}
