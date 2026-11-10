/** Diferencia OMS entre longitud (acostado) y talla (de pie), en cm. */
export const CORRECCION_LONGITUD_TALLA_CM = 0.7;

export type PosicionMedicion = 'acostado' | 'de_pie';

/**
 * Ajusta la medida a la posición que usa la tabla de referencia.
 * La longitud (acostado) es 0,7 cm mayor que la talla (de pie).
 *
 * @param valorCm medida tomada
 * @param medidoEn posición en que se midió
 * @param tablaEn posición que supone la tabla LMS
 */
export function ajustarLongitudTalla(
  valorCm: number,
  medidoEn: PosicionMedicion,
  tablaEn: PosicionMedicion,
): number {
  if (!Number.isFinite(valorCm) || valorCm <= 0) {
    throw new RangeError('valorCm debe ser un número positivo');
  }
  if (medidoEn === tablaEn) return valorCm;
  const ajustado =
    medidoEn === 'de_pie' ? valorCm + CORRECCION_LONGITUD_TALLA_CM : valorCm - CORRECCION_LONGITUD_TALLA_CM;
  // Redondeo a 1 decimal evita ruido binario (97.0 + 0.7 = 97.7).
  return Math.round(ajustado * 10) / 10;
}
