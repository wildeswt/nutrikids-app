import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  type CreateReminderInput,
  type ListRemindersQuery,
  type ReminderResponse,
  type ReminderStatus,
} from '@nutrikids/shared';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { prisma, withUser } from '../lib/prisma.js';
import { dispatchExpoPush } from './notifications.service.js';

/**
 * Recordatorios (NK-37, RF-16): listar, crear y marcar como realizados, más el despacho
 * periódico de los que ya entraron en su ventana de anticipación (`REMINDER_LEAD_HOURS`).
 * El acceso a las filas lo decide RLS (`child_access`): cuidador o profesional vinculado.
 */

function format(row: Prisma.ReminderGetPayload<object>): ReminderResponse {
  return {
    id: row.id,
    childId: row.childId,
    type: row.type,
    scheduledFor: row.scheduledFor.toISOString(),
    status: row.status as ReminderStatus,
  };
}

/** Recordatorios visibles para el usuario, los más próximos primero. */
export async function listReminders(
  auth: AuthContext,
  query: ListRemindersQuery,
): Promise<ReminderResponse[]> {
  const rows = await withUser(auth.userId, (tx) =>
    tx.reminder.findMany({
      where: {
        ...(query.childId ? { childId: query.childId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { scheduledFor: 'asc' },
      take: 200,
    }),
  );
  return rows.map(format);
}

export interface ReminderWriteResult {
  reminder: ReminderResponse;
  /** `false` si fue un reenvío idempotente del mismo `id`. */
  created: boolean;
}

/** Crea un recordatorio. Idempotente por el `id` del cliente. */
export async function createReminder(
  auth: AuthContext,
  input: CreateReminderInput,
): Promise<ReminderWriteResult> {
  const scheduledFor = new Date(input.scheduledFor);
  if (scheduledFor.getTime() <= Date.now()) {
    throw HttpError.badRequest('La fecha del recordatorio debe estar en el futuro');
  }

  return withUser(auth.userId, async (tx) => {
    const existing = await tx.reminder.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.childId !== input.childId) {
        throw HttpError.conflict('Ya existe un recordatorio con ese identificador');
      }
      return { reminder: format(existing), created: false };
    }
    const created = await tx.reminder.create({
      data: {
        id: input.id,
        childId: input.childId,
        type: input.type,
        scheduledFor,
        status: 'pending',
      },
    });
    return { reminder: format(created), created: true };
  });
}

/** Marca un recordatorio como realizado. Inexistente o ajeno → 404 (RLS). Idempotente. */
export async function completeReminder(auth: AuthContext, id: string): Promise<ReminderResponse> {
  return withUser(auth.userId, async (tx) => {
    const existing = await tx.reminder.findUnique({ where: { id } });
    if (!existing) {
      throw HttpError.notFound('Recordatorio no encontrado');
    }
    if (existing.status === 'completed') return format(existing);
    return format(await tx.reminder.update({ where: { id }, data: { status: 'completed' } }));
  });
}

interface DispatchedRow {
  notification_id: string;
  user_id: string;
  reminder_id: string;
}

/**
 * Despacha los recordatorios pendientes que ya están dentro de la anticipación configurada:
 * la función SQL los marca `sent` y crea la notificación interna para cada cuidador del niño;
 * aquí se envía el push (en segundo plano) a los dispositivos registrados de esos usuarios.
 * Devuelve cuántas notificaciones se generaron.
 */
export async function dispatchDueReminders(): Promise<{ processed: number }> {
  const rows = await prisma.$queryRaw<DispatchedRow[]>`
    SELECT notification_id, user_id, reminder_id
    FROM dispatch_due_reminders(${env.REMINDER_LEAD_HOURS}::int)
  `;

  if (rows.length > 0) void pushReminders(rows);
  return { processed: rows.length };
}

async function pushReminders(rows: readonly DispatchedRow[]): Promise<void> {
  try {
    const devices = await prisma.pushDevice.findMany({
      where: { userId: { in: [...new Set(rows.map((r) => r.user_id))] } },
    });
    const messages: ExpoPushMessage[] = rows.flatMap((row) =>
      devices
        .filter((d) => d.userId === row.user_id && Expo.isExpoPushToken(d.token))
        .map((d) => ({
          to: d.token,
          sound: 'default' as const,
          channelId: 'default',
          title: 'NutriKids',
          body: 'Tienes un recordatorio próximo',
          data: {
            reminderId: row.reminder_id,
            notificationId: row.notification_id,
            type: NOTIFICATION_TYPES.REMINDER_DUE,
            entityType: NOTIFICATION_ENTITY_TYPES.REMINDER,
          },
        })),
    );
    if (messages.length > 0) await dispatchExpoPush(messages);
  } catch (err) {
    console.error('Error al enviar push de recordatorios:', err);
  }
}
