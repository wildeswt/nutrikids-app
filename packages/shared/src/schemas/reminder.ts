import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common.js';
import { ReminderStatusSchema } from './followUp.js';

/**
 * Recordatorios (NK-37, RF-16). Los de «próximo control» los crea el servidor al registrar un
 * seguimiento; el cuidador o el profesional vinculado pueden crear los demás. La respuesta es
 * `ReminderResponse` (followUp.ts).
 */

/** Tipos que puede crear un usuario (`next_checkup` solo lo genera el servidor). */
export const USER_REMINDER_TYPES = ['checkup', 'activity'] as const;

export const UserReminderTypeSchema = z.enum(USER_REMINDER_TYPES);

/** `POST /reminders`. El `id` lo genera el cliente para que reenviarlo sea idempotente. */
export const CreateReminderInputSchema = z.strictObject({
  id: UuidSchema,
  childId: UuidSchema,
  type: UserReminderTypeSchema,
  scheduledFor: IsoDateTimeSchema,
});

/** `GET /reminders?childId=&status=` (ambos opcionales). */
export const ListRemindersQuerySchema = z.object({
  childId: UuidSchema.optional(),
  status: ReminderStatusSchema.optional(),
});

export const ReminderParamsSchema = z.object({
  id: UuidSchema,
});

export type CreateReminderInput = z.infer<typeof CreateReminderInputSchema>;
export type ListRemindersQuery = z.infer<typeof ListRemindersQuerySchema>;
export type ReminderParams = z.infer<typeof ReminderParamsSchema>;
