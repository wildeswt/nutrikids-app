import { z } from 'zod';
import { IsoDateSchema, UuidSchema, requiredText } from './common.js';

/**
 * Registro de alimentación (RF-06): cuántas comidas hizo el niño en un día y un detalle
 * opcional de lo que comió. Lo registran cuidadores y profesionales vinculados.
 */

/** Rango de comidas por día (coincide con el CHECK `feeding_logs_meals_per_day_range`). */
export const MEALS_PER_DAY_MIN = 0;
export const MEALS_PER_DAY_MAX = 12;

/** Largo máximo del detalle de alimentación. */
export const FEEDING_DETAILS_MAX = 500;

/** Máximo de registros por página al listar. */
export const FEEDING_LOGS_MAX_LIMIT = 365;
export const FEEDING_LOGS_DEFAULT_LIMIT = 100;

// ---------- Entrada ----------

/** `POST /children/:childId/feeding-logs`. */
export const CreateFeedingLogInputSchema = z.strictObject({
  /** UUID generado en el cliente para garantizar idempotencia ante reenvíos. */
  id: UuidSchema,
  /** Día al que corresponde el registro (`AAAA-MM-DD`); no puede ser futuro. */
  logDate: IsoDateSchema,
  mealsPerDay: z
    .number({ error: 'Las comidas por día deben ser un número' })
    .int({ error: 'Las comidas por día deben ser un número entero' })
    .min(MEALS_PER_DAY_MIN, {
      error: `Las comidas por día deben estar entre ${MEALS_PER_DAY_MIN} y ${MEALS_PER_DAY_MAX}`,
    })
    .max(MEALS_PER_DAY_MAX, {
      error: `Las comidas por día deben estar entre ${MEALS_PER_DAY_MIN} y ${MEALS_PER_DAY_MAX}`,
    }),
  details: requiredText(FEEDING_DETAILS_MAX).optional(),
});

/** `GET /children/:childId/feeding-logs?from=&to=&limit=` (todos opcionales). */
/** Edición de un registro (`PATCH`): los mismos datos que al crearlo, sin el `id`. */
export const UpdateFeedingLogInputSchema = CreateFeedingLogInputSchema.omit({ id: true });

export const ListFeedingLogsQuerySchema = z.object({
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(FEEDING_LOGS_MAX_LIMIT)
    .default(FEEDING_LOGS_DEFAULT_LIMIT),
});

// ---------- Salida ----------

export const FeedingLogResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  logDate: IsoDateSchema,
  mealsPerDay: z.number().int().nullable(),
  details: z.string().nullable(),
});

export type CreateFeedingLogInput = z.infer<typeof CreateFeedingLogInputSchema>;
export type UpdateFeedingLogInput = z.infer<typeof UpdateFeedingLogInputSchema>;
export type ListFeedingLogsQuery = z.infer<typeof ListFeedingLogsQuerySchema>;
export type FeedingLogResponse = z.infer<typeof FeedingLogResponseSchema>;
