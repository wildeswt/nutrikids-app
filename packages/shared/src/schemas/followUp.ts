import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema, requiredText } from './common.js';

/**
 * Seguimientos clínicos (RF-15): observaciones, recomendaciones, intervenciones y
 * derivaciones que registra un profesional, vinculadas o no a una alerta. Si se indica la
 * fecha del próximo control, el servidor crea el recordatorio correspondiente.
 */

/** Tipos de seguimiento (coinciden con el CHECK `follow_ups_type_check`). */
export const FOLLOW_UP_TYPES = [
  'observation',
  'recommendation',
  'intervention',
  'referral',
] as const;

export const FollowUpTypeSchema = z.enum(FOLLOW_UP_TYPES);

/** Largo máximo del detalle de un seguimiento. */
export const FOLLOW_UP_DETAILS_MAX = 2000;

/** Tipo del recordatorio creado a partir del próximo control de un seguimiento. */
export const NEXT_CHECKUP_REMINDER_TYPE = 'next_checkup';

/** Estados de un recordatorio (coinciden con el CHECK `reminders_status_check`). */
export const ReminderStatusSchema = z.enum(['pending', 'sent', 'completed']);

// ---------- Entrada ----------

/** `POST /children/:childId/follow-ups`. `professionalId` lo asigna el servidor. */
export const CreateFollowUpInputSchema = z.strictObject({
  /** UUID generado en el cliente para garantizar idempotencia sin conexión. */
  id: UuidSchema,
  type: FollowUpTypeSchema,
  details: requiredText(FOLLOW_UP_DETAILS_MAX),
  /** Fecha del próximo control (`AAAA-MM-DD`); crea un recordatorio. */
  nextCheckupDate: IsoDateSchema.optional(),
  /** Alerta del mismo niño a la que responde el seguimiento (opcional). */
  alertId: UuidSchema.optional(),
});

// ---------- Salida ----------

export const ReminderResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  type: z.string(),
  scheduledFor: IsoDateTimeSchema,
  status: ReminderStatusSchema,
});

export const FollowUpResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  alertId: UuidSchema.nullable(),
  professionalId: UuidSchema,
  type: FollowUpTypeSchema,
  details: z.string(),
  nextCheckupDate: IsoDateSchema.nullable(),
  /** Recordatorio del próximo control (null si no se indicó fecha). */
  reminder: ReminderResponseSchema.nullable(),
});

export type FollowUpType = z.infer<typeof FollowUpTypeSchema>;
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;
export type CreateFollowUpInput = z.infer<typeof CreateFollowUpInputSchema>;
export type ReminderResponse = z.infer<typeof ReminderResponseSchema>;
export type FollowUpResponse = z.infer<typeof FollowUpResponseSchema>;
