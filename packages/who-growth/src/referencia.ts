import type { FilaLMS } from './tablas/types.js';
import { WFA_FEMALE, WFA_MALE } from './tablas/wfa.js';
import { LHFA_FEMALE, LHFA_MALE } from './tablas/lhfa.js';
import { BFA_FEMALE, BFA_MALE } from './tablas/bfa.js';
import { WFL_FEMALE, WFL_MALE } from './tablas/wfl.js';
import { WFH_FEMALE, WFH_MALE } from './tablas/wfh.js';
import type { PosicionMedicion } from './longitud.js';

export * from './tablas/index.js';

/** Versión oficial de los patrones de crecimiento infantil de la OMS. */
export const WHO_REFERENCE_VERSION = 'WHO 2006' as const;
export type WhoReferenceVersion = typeof WHO_REFERENCE_VERSION;

export type IndicadorOMS =
  'WEIGHT_FOR_AGE' | 'LENGTH_HEIGHT_FOR_AGE' | 'WEIGHT_FOR_LENGTH_HEIGHT' | 'BMI_FOR_AGE';

export type SexoOMS = 'FEMALE' | 'MALE';
export type { PosicionMedicion };

function buscarEnArreglo(filas: FilaLMS[], x: number): FilaLMS | undefined {
  const xRedondeado = Math.round(x * 100) / 100;
  return filas.find((f) => Math.abs(f.x - xRedondeado) < 0.001);
}

/**
 * Obtiene los parámetros LMS de la referencia OMS 2006 para un indicador, sexo y valor x.
 *
 * - Para `WEIGHT_FOR_AGE`, `LENGTH_HEIGHT_FOR_AGE`, `BMI_FOR_AGE`: `x` es la edad en meses cumplidos (12 a 60).
 * - Para `WEIGHT_FOR_LENGTH_HEIGHT`: `x` es la longitud o talla en cm (intervalos de 0.5 cm).
 *   - Si se especifica `posicion`:
 *     - `'acostado'`: busca en la tabla de longitud (P/L, 45 a 110 cm).
 *     - `'de_pie'`: busca en la tabla de talla (P/T, 65 a 120 cm).
 *   - Si no se especifica posición, busca primero según la convención OMS (< 87 cm acostado, >= 87 cm de pie).
 *
 * @throws {RangeError} Si el valor x no existe en la tabla correspondiente.
 */
export function obtenerLMS(
  indicador: IndicadorOMS,
  sexo: SexoOMS,
  x: number,
  posicion?: PosicionMedicion,
): FilaLMS {
  let filas: FilaLMS[] | undefined;

  switch (indicador) {
    case 'WEIGHT_FOR_AGE':
      filas = sexo === 'FEMALE' ? WFA_FEMALE : WFA_MALE;
      break;

    case 'LENGTH_HEIGHT_FOR_AGE':
      filas = sexo === 'FEMALE' ? LHFA_FEMALE : LHFA_MALE;
      break;

    case 'BMI_FOR_AGE':
      filas = sexo === 'FEMALE' ? BFA_FEMALE : BFA_MALE;
      break;

    case 'WEIGHT_FOR_LENGTH_HEIGHT':
      if (posicion === 'acostado') {
        filas = sexo === 'FEMALE' ? WFL_FEMALE : WFL_MALE;
      } else if (posicion === 'de_pie') {
        filas = sexo === 'FEMALE' ? WFH_FEMALE : WFH_MALE;
      } else {
        if (x < 87) {
          filas = sexo === 'FEMALE' ? WFL_FEMALE : WFL_MALE;
        } else {
          filas = sexo === 'FEMALE' ? WFH_FEMALE : WFH_MALE;
        }
      }
      break;

    default:
      throw new RangeError(`Indicador desconocido: ${indicador}`);
  }

  const resultado = buscarEnArreglo(filas, x);
  if (resultado) {
    return resultado;
  }

  // Fallback para WEIGHT_FOR_LENGTH_HEIGHT: si no se encontró en WFL/WFH inicial, buscar en la otra tabla
  if (indicador === 'WEIGHT_FOR_LENGTH_HEIGHT') {
    const fallbackFilas =
      filas === (sexo === 'FEMALE' ? WFL_FEMALE : WFL_MALE)
        ? sexo === 'FEMALE'
          ? WFH_FEMALE
          : WFH_MALE
        : sexo === 'FEMALE'
          ? WFL_FEMALE
          : WFL_MALE;

    const fallbackResultado = buscarEnArreglo(fallbackFilas, x);
    if (fallbackResultado) {
      return fallbackResultado;
    }
  }

  throw new RangeError(
    `Valor x=${x} fuera de rango para el indicador ${indicador} (${sexo}${posicion ? `, ${posicion}` : ''})`,
  );
}
