/**
 * Método LMS (Cole, 1990) para z-scores de crecimiento.
 *
 *   z = ((x / M)^L - 1) / (L · S)     si L ≠ 0
 *   z = ln(x / M) / S                 si L = 0
 *
 * Es el z "crudo" de Cole; no aplica el ajuste de la OMS para |z| > 3.
 * Código puro: solo usa Math, para correr igual en Node y React Native.
 */

/** Curvas de referencia que se dibujan en las gráficas de crecimiento. */
export const CURVAS_Z = [-3, -2, 0, 2, 3] as const;
export type CurvaZ = (typeof CURVAS_Z)[number];

function validarLMS(M: number, S: number, L: number): void {
  if (!Number.isFinite(L)) throw new RangeError('L debe ser un número finito');
  if (!Number.isFinite(M) || M <= 0) throw new RangeError('M debe ser un número positivo');
  if (!Number.isFinite(S) || S <= 0) throw new RangeError('S debe ser un número positivo');
}

/** z-score de una medida `x` dados los parámetros LMS de la referencia. */
export function calcularZ(x: number, L: number, M: number, S: number): number {
  validarLMS(M, S, L);
  if (!Number.isFinite(x) || x <= 0) throw new RangeError('x debe ser un número positivo');
  if (L === 0) return Math.log(x / M) / S;
  return (Math.pow(x / M, L) - 1) / (L * S);
}

/** Inversa de `calcularZ`: la medida que corresponde a un z dado. */
export function medidaDesdeZ(z: number, L: number, M: number, S: number): number {
  validarLMS(M, S, L);
  if (!Number.isFinite(z)) throw new RangeError('z debe ser un número finito');
  if (L === 0) return M * Math.exp(S * z);
  const base = 1 + L * S * z;
  if (base <= 0) {
    throw new RangeError('z fuera del dominio de la curva LMS para estos parámetros');
  }
  return M * Math.pow(base, 1 / L);
}

/** Medidas de las curvas −3, −2, 0, +2 y +3 para dibujar la gráfica. */
export function curvasZ(L: number, M: number, S: number): Record<CurvaZ, number> {
  const out = {} as Record<CurvaZ, number>;
  for (const z of CURVAS_Z) out[z] = medidaDesdeZ(z, L, M, S);
  return out;
}

/** erf con la aproximación de alta precisión de Numerical Recipes (erfc Chebyshev, error < 1.2e-7). */
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

/** Percentil (0–100) correspondiente a un z-score, con la CDF normal estándar. */
export function percentilDesdeZ(z: number): number {
  if (!Number.isFinite(z)) throw new RangeError('z debe ser un número finito');
  return 50 * erfc(-z / Math.SQRT2);
}
