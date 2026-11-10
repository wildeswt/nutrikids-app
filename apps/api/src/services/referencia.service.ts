/**
 * Servicio que genera las 5 curvas de z-score (−3, −2, 0, +2, +3) de la
 * referencia OMS 2006 usando la relación inversa `medidaDesdeZ` (RF-10, RT-08).
 *
 * Para cada indicador y sexo se recorren todos los valores x de la tabla
 * correspondiente, se obtienen los parámetros LMS y se calcula la medida
 * antropométrica que corresponde a cada nivel de z.
 */

import {
  BFA_FEMALE,
  BFA_MALE,
  CURVAS_Z,
  LHFA_FEMALE,
  LHFA_MALE,
  WFA_FEMALE,
  WFA_MALE,
  WFH_FEMALE,
  WFH_MALE,
  WFL_FEMALE,
  WFL_MALE,
  WHO_REFERENCE_VERSION,
  curvasZ,
  obtenerLMS,
} from '@nutrikids/who-growth';
import type { CurvasQuery, CurvasResponse, PuntoCurva } from '@nutrikids/shared';

/** Mapa de clave de curva (string) al valor z numérico. */
const CURVA_KEYS = ['-3', '-2', '0', '+2', '+3'] as const;
type CurvaKey = (typeof CURVA_KEYS)[number];

/** Convierte los query params de la API a los tipos del paquete who-growth. */
function mapearPosicion(posicion?: string): 'acostado' | 'de_pie' | undefined {
  if (posicion === 'RECUMBENT') return 'acostado';
  if (posicion === 'STANDING') return 'de_pie';
  return undefined;
}

/**
 * Devuelve todos los valores x (eje de la gráfica) de la tabla OMS que
 * corresponde al indicador, sexo y posición dados.
 *
 * Para WEIGHT_FOR_LENGTH_HEIGHT sin posición explícita se combinan WFL y WFH
 * en un único eje x ordenado (45–120 cm).
 */
function obtenerValoresX(
  indicador: string,
  sexo: string,
  posicionOMS?: 'acostado' | 'de_pie',
): number[] {
  if (indicador === 'WEIGHT_FOR_LENGTH_HEIGHT') {
    if (posicionOMS === 'acostado') {
      return (sexo === 'FEMALE' ? WFL_FEMALE : WFL_MALE).map((f) => f.x);
    }
    if (posicionOMS === 'de_pie') {
      return (sexo === 'FEMALE' ? WFH_FEMALE : WFH_MALE).map((f) => f.x);
    }
    // Sin posición: unión de WFL y WFH, ordenada
    const xWfl = (sexo === 'FEMALE' ? WFL_FEMALE : WFL_MALE).map((f) => f.x);
    const xWfh = (sexo === 'FEMALE' ? WFH_FEMALE : WFH_MALE).map((f) => f.x);
    return [...new Set([...xWfl, ...xWfh])].sort((a, b) => a - b);
  }

  if (indicador === 'WEIGHT_FOR_AGE') {
    return (sexo === 'FEMALE' ? WFA_FEMALE : WFA_MALE).map((f) => f.x);
  }
  if (indicador === 'LENGTH_HEIGHT_FOR_AGE') {
    return (sexo === 'FEMALE' ? LHFA_FEMALE : LHFA_MALE).map((f) => f.x);
  }
  // BMI_FOR_AGE
  return (sexo === 'FEMALE' ? BFA_FEMALE : BFA_MALE).map((f) => f.x);
}

/**
 * Determina la etiqueta del eje X para incluirla en la respuesta.
 * Permite que el cliente sepa si el eje es edad (meses) o talla/longitud (cm).
 */
function determinarEjeX(
  indicador: string,
  posicionOMS?: 'acostado' | 'de_pie',
): CurvasResponse['ejeX'] {
  if (indicador !== 'WEIGHT_FOR_LENGTH_HEIGHT') return 'edad_meses';
  return posicionOMS === 'de_pie' ? 'talla_cm' : 'longitud_cm';
}

/**
 * Calcula las 5 series de curvas de referencia OMS para un indicador y sexo.
 *
 * Implementación de RF-10 / RT-08:
 * - Usa `obtenerLMS` para obtener los parámetros L, M, S de cada fila.
 * - Usa `curvasZ` (que internamente llama `medidaDesdeZ`) para calcular la
 *   medida antropométrica que corresponde a cada z-score.
 * - La respuesta incluye el campo `version` para cumplir con RT-08.
 */
export function calcularCurvas(query: CurvasQuery): CurvasResponse {
  const { indicador, sexo, posicion } = query;
  const posicionOMS = mapearPosicion(posicion);

  const valoresX = obtenerValoresX(indicador, sexo, posicionOMS);
  const ejeX = determinarEjeX(indicador, posicionOMS);

  // Inicializar las 5 series vacías
  const series: Record<CurvaKey, PuntoCurva[]> = {
    '-3': [],
    '-2': [],
    '0': [],
    '+2': [],
    '+3': [],
  };

  for (const x of valoresX) {
    try {
      const { l, m, s } = obtenerLMS(
        indicador as Parameters<typeof obtenerLMS>[0],
        sexo as Parameters<typeof obtenerLMS>[1],
        x,
        posicionOMS,
      );

      const vals = curvasZ(l, m, s);

      // CURVAS_Z = [-3, -2, 0, 2, 3]; CURVA_KEYS = ['-3', '-2', '0', '+2', '+3']
      CURVAS_Z.forEach((z, i) => {
        const key = CURVA_KEYS[i]!;
        series[key].push({ x, y: Math.round(vals[z] * 1000) / 1000 });
      });
    } catch {
      // Punto fuera de rango — se omite (puede ocurrir en la zona de solapamiento WFL/WFH)
    }
  }

  return {
    version: WHO_REFERENCE_VERSION,
    indicador,
    sexo,
    ejeX,
    curvas: series,
  };
}
