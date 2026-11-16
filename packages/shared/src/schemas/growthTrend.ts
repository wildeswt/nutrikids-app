import { z } from 'zod';
import { UuidSchema } from './common.js';
import { IndicatorSchema } from './enums.js';

/**
 * Valor de tendencia de crecimiento para la vista del cuidador (NK-74).
 * Solo se expone FAVORABLE o NONE; nunca se comunican etiquetas negativas al cuidador.
 */
export const GrowthTrendValueSchema = z.enum(['FAVORABLE', 'NONE']);
export type GrowthTrendValue = z.infer<typeof GrowthTrendValueSchema>;

/**
 * Resultado de tendencia por indicador sin exponer puntajes z, percentiles ni clasificaciones (RF-14).
 */
export const GrowthTrendItemSchema = z.object({
  indicator: IndicatorSchema,
  trend: GrowthTrendValueSchema,
  basedOnCheckupId: UuidSchema,
});
export type GrowthTrendItem = z.infer<typeof GrowthTrendItemSchema>;

/**
 * Respuesta del endpoint `GET /children/:childId/growth-trend`.
 * Lista de tendencias por indicador evaluadas en el servidor a partir del último control vigente.
 */
export const GrowthTrendResponseSchema = z.array(GrowthTrendItemSchema);
export type GrowthTrendResponse = z.infer<typeof GrowthTrendResponseSchema>;

/** Parámetros de ruta para consultar la tendencia de un niño. */
export const GrowthTrendParamsSchema = z.object({
  childId: UuidSchema,
});
export type GrowthTrendParams = z.infer<typeof GrowthTrendParamsSchema>;
