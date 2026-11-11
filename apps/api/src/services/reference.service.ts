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
import type {
  OmsCurvePoint,
  OmsReferenceCurvesQuery,
  OmsReferenceCurvesResponse,
} from '@nutrikids/shared';

/** Mapa de clave de curva (string) al valor z numérico. */
const CURVE_KEYS = ['-3', '-2', '0', '+2', '+3'] as const;
type CurveKey = (typeof CURVE_KEYS)[number];

/** Convierte los query params de la API a los tipos del paquete who-growth. */
function mapPosition(position?: string): 'acostado' | 'de_pie' | undefined {
  if (position === 'RECUMBENT') return 'acostado';
  if (position === 'STANDING') return 'de_pie';
  return undefined;
}

/**
 * Devuelve todos los valores x (eje de la gráfica) de la tabla OMS que
 * corresponde al indicador, sexo y posición dados.
 *
 * Para WEIGHT_FOR_LENGTH_HEIGHT sin posición explícita se combinan WFL y WFH
 * en un único eje x ordenado (45–120 cm).
 */
function getXValues(indicator: string, sex: string, omsPosition?: 'acostado' | 'de_pie'): number[] {
  if (indicator === 'WEIGHT_FOR_LENGTH_HEIGHT') {
    if (omsPosition === 'acostado') {
      return (sex === 'FEMALE' ? WFL_FEMALE : WFL_MALE).map((f) => f.x);
    }
    if (omsPosition === 'de_pie') {
      return (sex === 'FEMALE' ? WFH_FEMALE : WFH_MALE).map((f) => f.x);
    }
    // Sin posición: unión de WFL y WFH, ordenada
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
 * Determina la etiqueta del eje X para incluirla en la respuesta.
 * Permite que el cliente sepa si el eje es edad (meses) o talla/longitud (cm).
 */
function determineXAxis(
  indicator: string,
  omsPosition?: 'acostado' | 'de_pie',
): OmsReferenceCurvesResponse['xAxis'] {
  if (indicator !== 'WEIGHT_FOR_LENGTH_HEIGHT') return 'age_months';
  return omsPosition === 'de_pie' ? 'height_cm' : 'length_cm';
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
export function calculateReferenceCurves(
  query: OmsReferenceCurvesQuery,
): OmsReferenceCurvesResponse {
  const { indicator, sex, position } = query;
  const omsPosition = mapPosition(position);

  const xValues = getXValues(indicator, sex, omsPosition);
  const xAxis = determineXAxis(indicator, omsPosition);

  const series: Record<CurveKey, OmsCurvePoint[]> = {
    '-3': [],
    '-2': [],
    '0': [],
    '+2': [],
    '+3': [],
  };

  for (const x of xValues) {
    try {
      const { l, m, s } = obtenerLMS(
        indicator as Parameters<typeof obtenerLMS>[0],
        sex as Parameters<typeof obtenerLMS>[1],
        x,
        omsPosition,
      );

      const vals = curvasZ(l, m, s);

      // CURVAS_Z = [-3, -2, 0, 2, 3]; CURVE_KEYS = ['-3', '-2', '0', '+2', '+3']
      CURVAS_Z.forEach((z, i) => {
        const key = CURVE_KEYS[i]!;
        series[key].push({ x, y: Math.round(vals[z] * 1000) / 1000 });
      });
    } catch {
      // Punto fuera de rango — se omite (puede ocurrir en la zona de solapamiento WFL/WFH)
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
