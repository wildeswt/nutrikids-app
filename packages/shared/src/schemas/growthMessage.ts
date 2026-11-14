import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Mensaje de crecimiento para el cuidador (NK-35, RF-14): lenguaje sencillo, sin puntajes z,
 * percentiles ni clasificaciones. La alerta clínica solo se comunica después de que el
 * profesional la revisó.
 */

/** `ok`: no hay nada que comunicar todavía (incluye alertas aún sin revisar). `reviewed`: ya hay revisión. */
export const GrowthMessageStatusSchema = z.enum(['ok', 'reviewed']);

/** Dirección general, sin cifras: el crecimiento está por debajo o por encima de lo esperado. */
export const GrowthConcernSchema = z.enum(['below', 'above']);

export const GrowthMessageParamsSchema = z.object({ childId: UuidSchema });

export const GrowthMessageResponseSchema = z.object({
  childId: UuidSchema,
  status: GrowthMessageStatusSchema,
  concern: GrowthConcernSchema.nullable(),
  /** Texto de la recomendación que dejó el profesional para la familia (puede no existir). */
  recommendation: z.string().nullable(),
  nextCheckupDate: IsoDateSchema.nullable(),
  reviewedAt: IsoDateTimeSchema.nullable(),
});

export type GrowthMessageStatus = z.infer<typeof GrowthMessageStatusSchema>;
export type GrowthConcern = z.infer<typeof GrowthConcernSchema>;
export type GrowthMessageParams = z.infer<typeof GrowthMessageParamsSchema>;
export type GrowthMessageResponse = z.infer<typeof GrowthMessageResponseSchema>;
