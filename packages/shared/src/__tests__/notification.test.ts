import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  NotificationParamsSchema,
  NotificationResponseSchema,
  NotificationTypeSchema,
  PushDeviceResponseSchema,
  PushPlatformSchema,
  RegisterPushDeviceInputSchema,
} from '../index.js';

describe('esquemas y constantes de notificaciones', () => {
  it('define tipos válidos de notificación', () => {
    expect(NotificationTypeSchema.safeParse('alert_new').success).toBe(true);
    expect(NotificationTypeSchema.safeParse('alert_overdue').success).toBe(true);
    expect(NotificationTypeSchema.safeParse('alert_pending_review').success).toBe(true);
    expect(NotificationTypeSchema.safeParse('random_type').success).toBe(false);
  });

  it('define plataformas soportadas de push', () => {
    expect(PushPlatformSchema.safeParse('android').success).toBe(true);
    expect(PushPlatformSchema.safeParse('ios').success).toBe(true);
    expect(PushPlatformSchema.safeParse('windows').success).toBe(false);
  });

  it('valida RegisterPushDeviceInputSchema', () => {
    const valid = {
      token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      platform: 'android',
    };
    expect(RegisterPushDeviceInputSchema.safeParse(valid).success).toBe(true);

    // Token vacío
    expect(
      RegisterPushDeviceInputSchema.safeParse({ token: '', platform: 'android' }).success,
    ).toBe(false);

    // Plataforma desconocida
    expect(
      RegisterPushDeviceInputSchema.safeParse({ token: 'abc', platform: 'unknown' }).success,
    ).toBe(false);

    // Campos adicionales (strict)
    expect(RegisterPushDeviceInputSchema.safeParse({ ...valid, extra: 'forbidden' }).success).toBe(
      false,
    );
  });

  it('valida NotificationParamsSchema', () => {
    expect(
      NotificationParamsSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' }).success,
    ).toBe(true);
    expect(NotificationParamsSchema.safeParse({ id: 'invalid-uuid' }).success).toBe(false);
  });

  it('valida PushDeviceResponseSchema y NotificationResponseSchema', () => {
    const device = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      platform: 'android',
      lastSeenAt: '2026-11-14T10:00:00.000Z',
    };
    expect(PushDeviceResponseSchema.safeParse(device).success).toBe(true);

    const notification = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      type: NOTIFICATION_TYPES.ALERT_NEW,
      entityType: NOTIFICATION_ENTITY_TYPES.ALERT,
      entityId: '123e4567-e89b-12d3-a456-426614174002',
      sentAt: '2026-11-14T10:00:00.000Z',
      readAt: null,
    };
    expect(NotificationResponseSchema.safeParse(notification).success).toBe(true);
  });
});
