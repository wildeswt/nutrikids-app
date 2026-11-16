import { z } from 'zod';
import {
  BaseCheckupInputObject,
  CaregiverCheckupResponseSchema,
  CheckupResponseSchema,
  validateOutlierConfirmation,
} from './checkup.js';
import { UuidSchema } from './common.js';
import { IndicatorSchema } from './enums.js';

/**
 * Sincronización por lotes de controles registrados sin conexión (RT-02, `POST /sync/checkups`).
 */

/** Máximo de controles aceptados en un solo lote. */
export const SYNC_MAX_BATCH_SIZE = 100;

/** Un control del lote: igual al de creación, más el niño al que pertenece. */
export const SyncCheckupItemSchema = BaseCheckupInputObject.extend({
  childId: UuidSchema,
}).superRefine(validateOutlierConfirmation);

/**
 * Cuerpo de `POST /sync/checkups`. Los ítems se validan uno a uno en el servidor
 * (`SyncCheckupItemSchema`) para que un control inválido no haga perder el resto del lote.
 */
export const SyncCheckupsInputSchema = z.strictObject({
  checkups: z
    .array(z.unknown())
    .min(1, { error: 'El lote debe contener al menos un control' })
    .max(SYNC_MAX_BATCH_SIZE, {
      error: `El lote admite como máximo ${SYNC_MAX_BATCH_SIZE} controles`,
    }),
});

/**
 * Estado de cada control del lote:
 * - `CREATED`: insertado en esta llamada.
 * - `DUPLICATE`: ya existía con ese `id` (reenvío idempotente); no se duplicó.
 * - `ERROR`: no se pudo registrar; el resto del lote no se ve afectado.
 */
export const SyncCheckupStatusSchema = z.enum(['CREATED', 'DUPLICATE', 'ERROR']);

/** Campos de un indicador en los que el cálculo del celular difiere del servidor. */
export const SyncDiscrepancyFieldSchema = z.enum(['zScore', 'percentile', 'classification']);

/**
 * Indicador cuyo resultado calculado por el celular difiere del recalculado por el servidor.
 * El servidor conserva el suyo y registra la discrepancia en auditoría.
 */
export const SyncDiscrepancySchema = z.object({
  indicator: IndicatorSchema,
  fields: z.array(SyncDiscrepancyFieldSchema).min(1),
});

export const SyncCheckupResultSchema = z.object({
  /** `id` del control enviado (null si el ítem no traía un UUID válido). */
  id: UuidSchema.nullable(),
  status: SyncCheckupStatusSchema,
  /** Control tal como quedó en el servidor (vista según el perfil, RF-14). */
  checkup: z.union([CheckupResponseSchema, CaregiverCheckupResponseSchema]).optional(),
  discrepancies: z.array(SyncDiscrepancySchema).optional(),
  error: z
    .object({
      status: z.number().int(),
      message: z.string(),
    })
    .optional(),
});

/** Respuesta de `POST /sync/checkups`: un resultado por ítem, en el mismo orden del lote. */
export const SyncCheckupsResponseSchema = z.object({
  results: z.array(SyncCheckupResultSchema),
});

export type SyncCheckupItem = z.infer<typeof SyncCheckupItemSchema>;
export type SyncCheckupsInput = z.infer<typeof SyncCheckupsInputSchema>;
export type SyncCheckupStatus = z.infer<typeof SyncCheckupStatusSchema>;
export type SyncDiscrepancyField = z.infer<typeof SyncDiscrepancyFieldSchema>;
export type SyncDiscrepancy = z.infer<typeof SyncDiscrepancySchema>;
export type SyncCheckupResult = z.infer<typeof SyncCheckupResultSchema>;
export type SyncCheckupsResponse = z.infer<typeof SyncCheckupsResponseSchema>;
