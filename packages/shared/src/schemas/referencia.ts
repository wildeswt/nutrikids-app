import { z } from 'zod';
import { IndicatorSchema, SexSchema, PositionSchema } from './enums.js';

// Mensajes de validación en español (NK-15, RT-10).
z.config(z.locales.es());

/** Query params del endpoint GET /referencia/curvas. */
export const CurvasQuerySchema = z.object({
  indicador: IndicatorSchema,
  sexo: SexSchema,
  /**
   * Solo relevante para `WEIGHT_FOR_LENGTH_HEIGHT`.
   * Si se omite, se aplica la convención OMS (< 87 cm acostado, ≥ 87 cm de pie).
   */
  posicion: PositionSchema.optional(),
});

export type CurvasQuery = z.infer<typeof CurvasQuerySchema>;

/** Un punto (x, y) de una curva de referencia. */
export const PuntoCurvaSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type PuntoCurva = z.infer<typeof PuntoCurvaSchema>;

/** Respuesta de GET /referencia/curvas. */
export const CurvasResponseSchema = z.object({
  /** Versión de los patrones de referencia OMS. Permite versionar la respuesta (RT-08). */
  version: z.literal('WHO 2006'),
  indicador: IndicatorSchema,
  sexo: SexSchema,
  /**
   * Nombre del eje X:
   * - `'edad_meses'` para P/E, T/E e IMC/E.
   * - `'longitud_cm'` para P/T acostado (WFL).
   * - `'talla_cm'` para P/T de pie (WFH).
   */
  ejeX: z.enum(['edad_meses', 'longitud_cm', 'talla_cm']),
  /** Las 5 series z (−3, −2, 0, +2, +3), cada una lista para graficar. */
  curvas: z.object({
    '-3': z.array(PuntoCurvaSchema),
    '-2': z.array(PuntoCurvaSchema),
    '0': z.array(PuntoCurvaSchema),
    '+2': z.array(PuntoCurvaSchema),
    '+3': z.array(PuntoCurvaSchema),
  }),
});

export type CurvasResponse = z.infer<typeof CurvasResponseSchema>;
