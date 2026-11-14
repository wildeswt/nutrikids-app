import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Notificaciones internas y dispositivos push (NK-36, RF-13, RT-09).
 */

export const NOTIFICATION_TYPES = {
  ALERT_NEW: 'alert_new',
  ALERT_OVERDUE: 'alert_overdue',
  ALERT_PENDING_REVIEW: 'alert_pending_review',
  REMINDER_DUE: 'reminder_due',
} as const;

export const NotificationTypeSchema = z.enum([
  NOTIFICATION_TYPES.ALERT_NEW,
  NOTIFICATION_TYPES.ALERT_OVERDUE,
  NOTIFICATION_TYPES.ALERT_PENDING_REVIEW,
  NOTIFICATION_TYPES.REMINDER_DUE,
]);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NOTIFICATION_ENTITY_TYPES = {
  ALERT: 'alert',
  REMINDER: 'reminder',
} as const;

export const NotificationEntityTypeSchema = z.enum([
  NOTIFICATION_ENTITY_TYPES.ALERT,
  NOTIFICATION_ENTITY_TYPES.REMINDER,
]);

export type NotificationEntityType = z.infer<typeof NotificationEntityTypeSchema>;

export const PUSH_PLATFORMS = ['android', 'ios'] as const;

export const PushPlatformSchema = z.enum(PUSH_PLATFORMS);

export type PushPlatform = z.infer<typeof PushPlatformSchema>;

// ---------- Entrada ----------

export const RegisterPushDeviceInputSchema = z.strictObject({
  token: z
    .string()
    .trim()
    .min(1, { error: 'El token de dispositivo es obligatorio' })
    .max(255, { error: 'El token no puede superar 255 caracteres' }),
  platform: PushPlatformSchema,
});

export type RegisterPushDeviceInput = z.infer<typeof RegisterPushDeviceInputSchema>;

export const NotificationParamsSchema = z.object({
  id: UuidSchema,
});

export type NotificationParams = z.infer<typeof NotificationParamsSchema>;

// ---------- Salida ----------

export const PushDeviceResponseSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  platform: PushPlatformSchema,
  lastSeenAt: IsoDateTimeSchema,
});

export type PushDeviceResponse = z.infer<typeof PushDeviceResponseSchema>;

export const NotificationResponseSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  type: z.string(),
  entityType: z.string(),
  entityId: UuidSchema,
  sentAt: IsoDateTimeSchema,
  readAt: IsoDateTimeSchema.nullable(),
});

export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;
