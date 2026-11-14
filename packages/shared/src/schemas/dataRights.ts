import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema, requiredText } from './common.js';
import { SexSchema } from './enums.js';

/**
 * Derechos del representante sobre los datos del niño (NK-41, RF-20): rectificación,
 * exportación y solicitud de eliminación (Ley Orgánica de Protección de Datos Personales).
 */

/** Plazo legal (días) para atender una solicitud de eliminación. */
export const ERASURE_LEGAL_DEADLINE_DAYS = 15;

export const ERASURE_REQUEST_STATUSES = ['pending', 'completed', 'cancelled'] as const;

export const ErasureRequestStatusSchema = z.enum(ERASURE_REQUEST_STATUSES);

// ---------- Entrada ----------

/** `PATCH /children/:childId`: al menos un campo de identidad. */
export const RectifyChildInputSchema = z
  .strictObject({
    firstName: requiredText(100).optional(),
    lastName: requiredText(100).optional(),
    birthDate: IsoDateSchema.optional(),
    sex: SexSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Indica al menos un dato a rectificar',
  });

export const ErasureRequestParamsSchema = z.object({
  childId: UuidSchema,
  requestId: UuidSchema,
});

// ---------- Salida ----------

export const ErasureRequestResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  status: ErasureRequestStatusSchema,
  requestedAt: IsoDateTimeSchema,
  /** Fecha límite legal para atender la solicitud. */
  dueAt: IsoDateTimeSchema,
  /** Cuándo se ejecutó o se canceló; `null` mientras está pendiente. */
  resolvedAt: IsoDateTimeSchema.nullable(),
});

export type RectifyChildInput = z.infer<typeof RectifyChildInputSchema>;
export type ErasureRequestStatus = z.infer<typeof ErasureRequestStatusSchema>;
export type ErasureRequestParams = z.infer<typeof ErasureRequestParamsSchema>;
export type ErasureRequestResponse = z.infer<typeof ErasureRequestResponseSchema>;
