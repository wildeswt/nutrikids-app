/**
 * Clasificación del estado nutricional a partir de z-scores OMS.
 * Todas las comparaciones son estrictas: z = −2,00 NO es emaciación y z = +2,00 NO es sobrepeso.
 */

export const RIESGOS_T = [
  'desnutricion_aguda_grave',
  'retraso_grave',
  'bajo_peso_grave',
  'emaciacion',
  'retraso_crecimiento',
  'bajo_peso',
  'obesidad',
  'sobrepeso',
  'riesgo_sobrepeso',
  'normal',
] as const;

/** Valores de `riesgo_t`. El orden del arreglo es la prioridad (el primero es el más grave). */
export type RiesgoT = (typeof RIESGOS_T)[number];

/**
 * Qué criterio genera la categoría `sobrepeso` (y por tanto la alerta):
 * - `'PT'`: P/T > +2 (sección de solución del informe). Es el valor por defecto.
 * - `'IMCE'`: IMC/E > +2 (marco teórico del informe).
 * - `'ambos'`: cualquiera de los dos.
 */
export type CriterioSobrepeso = 'PT' | 'IMCE' | 'ambos';

export interface PuntosCorte {
  /** P/T < este valor → desnutrición aguda grave (prioridad máxima). */
  desnutricionAgudaGravePT: number;
  /** P/T < este valor → emaciación. */
  emaciacionPT: number;
  /** P/E < este valor → bajo peso grave. */
  bajoPesoGravePE: number;
  /** P/E < este valor → bajo peso. */
  bajoPesoPE: number;
  /** T/E < este valor → retraso grave del crecimiento. */
  retrasoGraveTE: number;
  /** T/E < este valor → retraso del crecimiento. */
  retrasoTE: number;
  /** P/T > este valor → sobrepeso (si el criterio incluye 'PT'). */
  sobrepesoPT: number;
  /** IMC/E > este valor → sobrepeso (si el criterio incluye 'IMCE'). */
  sobrepesoIMCE: number;
  /** IMC/E > este valor → riesgo de sobrepeso. */
  riesgoSobrepesoIMCE: number;
  /** IMC/E > este valor → obesidad. */
  obesidadIMCE: number;
  /** Criterio que genera `sobrepeso`. */
  criterioSobrepeso: CriterioSobrepeso;
}

export const PUNTOS_CORTE_POR_DEFECTO: Readonly<PuntosCorte> = Object.freeze({
  desnutricionAgudaGravePT: -3,
  emaciacionPT: -2,
  bajoPesoGravePE: -3,
  bajoPesoPE: -2,
  retrasoGraveTE: -3,
  retrasoTE: -2,
  sobrepesoPT: 2,
  sobrepesoIMCE: 2,
  riesgoSobrepesoIMCE: 1,
  obesidadIMCE: 3,
  criterioSobrepeso: 'PT',
});

/** z-scores disponibles; los ausentes (p. ej. IMC/E por debajo de cierta edad) se omiten. */
export interface ZScores {
  /** Peso para la edad. */
  zPE?: number | null;
  /** Talla (longitud) para la edad. */
  zTE?: number | null;
  /** Peso para la talla (longitud). */
  zPT?: number | null;
  /** IMC para la edad. */
  zIMCE?: number | null;
}

export interface Clasificacion {
  /** Todas las categorías aplicables, de mayor a menor prioridad; `['normal']` si ninguna. */
  categorias: RiesgoT[];
  /** La categoría de mayor prioridad. */
  principal: RiesgoT;
  /** `true` si `principal` no es `normal` (hay algo que revisar). */
  alerta: boolean;
}

function definido(z: number | null | undefined): z is number {
  return typeof z === 'number' && Number.isFinite(z);
}

export function clasificar(
  zs: ZScores,
  puntosCorte: Partial<PuntosCorte> = {},
): Clasificacion {
  const pc: PuntosCorte = { ...PUNTOS_CORTE_POR_DEFECTO, ...puntosCorte };
  const { zPE, zTE, zPT, zIMCE } = zs;
  const encontradas = new Set<RiesgoT>();

  if (definido(zPT)) {
    if (zPT < pc.desnutricionAgudaGravePT) encontradas.add('desnutricion_aguda_grave');
    else if (zPT < pc.emaciacionPT) encontradas.add('emaciacion');
  }
  if (definido(zPE)) {
    if (zPE < pc.bajoPesoGravePE) encontradas.add('bajo_peso_grave');
    else if (zPE < pc.bajoPesoPE) encontradas.add('bajo_peso');
  }
  if (definido(zTE)) {
    if (zTE < pc.retrasoGraveTE) encontradas.add('retraso_grave');
    else if (zTE < pc.retrasoTE) encontradas.add('retraso_crecimiento');
  }

  const sobrepesoPorPT =
    pc.criterioSobrepeso !== 'IMCE' && definido(zPT) && zPT > pc.sobrepesoPT;
  const sobrepesoPorIMCE =
    pc.criterioSobrepeso !== 'PT' && definido(zIMCE) && zIMCE > pc.sobrepesoIMCE;
  if (sobrepesoPorPT || sobrepesoPorIMCE) encontradas.add('sobrepeso');

  if (definido(zIMCE)) {
    if (zIMCE > pc.obesidadIMCE) encontradas.add('obesidad');
    if (zIMCE > pc.riesgoSobrepesoIMCE) encontradas.add('riesgo_sobrepeso');
  }

  const categorias = RIESGOS_T.filter((r) => encontradas.has(r));
  if (categorias.length === 0) categorias.push('normal');
  const principal = categorias[0] ?? 'normal';
  return { categorias, principal, alerta: principal !== 'normal' };
}
