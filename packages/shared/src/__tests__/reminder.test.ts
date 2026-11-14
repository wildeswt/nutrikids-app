import { describe, expect, it } from 'vitest';
import {
  CreateReminderInputSchema,
  ListRemindersQuerySchema,
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  NotificationEntityTypeSchema,
  NotificationTypeSchema,
  ReminderParamsSchema,
  UserReminderTypeSchema,
} from '../index.js';

const id = '3f1c0f9e-6a53-4f0e-9a64-0d3a3d3c6b11';

describe('esquemas de recordatorios', () => {
  it('acepta solo los tipos que crea un usuario (next_checkup es del servidor)', () => {
    expect(UserReminderTypeSchema.safeParse('checkup').success).toBe(true);
    expect(UserReminderTypeSchema.safeParse('activity').success).toBe(true);
    expect(UserReminderTypeSchema.safeParse('next_checkup').success).toBe(false);
  });

  it('valida CreateReminderInputSchema (estricto, con fecha ISO con zona)', () => {
    const valid = { id, childId: id, type: 'checkup', scheduledFor: '2026-12-01T13:00:00.000Z' };
    expect(CreateReminderInputSchema.safeParse(valid).success).toBe(true);
    expect(
      CreateReminderInputSchema.safeParse({ ...valid, scheduledFor: '2026-12-01' }).success,
    ).toBe(false);
    expect(CreateReminderInputSchema.safeParse({ ...valid, status: 'completed' }).success).toBe(
      false,
    );
    expect(CreateReminderInputSchema.safeParse({ ...valid, id: 'x' }).success).toBe(false);
  });

  it('valida los filtros del listado y el parámetro :id', () => {
    expect(ListRemindersQuerySchema.safeParse({}).success).toBe(true);
    expect(ListRemindersQuerySchema.safeParse({ childId: id, status: 'sent' }).success).toBe(true);
    expect(ListRemindersQuerySchema.safeParse({ status: 'otro' }).success).toBe(false);
    expect(ReminderParamsSchema.safeParse({ id }).success).toBe(true);
    expect(ReminderParamsSchema.safeParse({ id: '1' }).success).toBe(false);
  });

  it('las notificaciones admiten el tipo reminder_due sobre la entidad reminder', () => {
    expect(NotificationTypeSchema.safeParse(NOTIFICATION_TYPES.REMINDER_DUE).success).toBe(true);
    expect(NotificationEntityTypeSchema.safeParse(NOTIFICATION_ENTITY_TYPES.REMINDER).success).toBe(
      true,
    );
  });
});
