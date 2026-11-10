/**
 * Parámetros LMS de crecimiento OMS (Cole, 1990).
 */
export interface FilaLMS {
  /** Eje x: edad en meses cumplidos (P/E, T/E, IMC/E) o longitud/talla en cm (P/T). */
  x: number;
  /** Parámetro de asimetría Box-Cox (Lambda). */
  l: number;
  /** Mediana de la población de referencia (Mu). */
  m: number;
  /** Coeficiente de variación generalizado (Sigma). */
  s: number;
}
