import crypto from 'node:crypto';
import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  type NotificationResponse,
  type PushDeviceResponse,
  type PushPlatform,
  type RegisterPushDeviceInput,
} from '@nutrikids/shared';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { prisma, withUser } from '../lib/prisma.js';
import { markAlertsNotified } from './alerts.service.js';

export const expoClient = new Expo();

/**
 * Registra o actualiza el token de push de un dispositivo.
 * Si el token ya existe (por ejemplo, cambio de usuario en el mismo dispositivo),
 * actualiza el userId, plataforma y marca lastSeenAt.
 */
export async function registerPushDevice(
  userId: string,
  input: RegisterPushDeviceInput,
): Promise<PushDeviceResponse> {
  const device = await prisma.pushDevice.upsert({
    where: { token: input.token },
    create: {
      userId,
      token: input.token,
      platform: input.platform,
      lastSeenAt: new Date(),
    },
    update: {
      userId,
      platform: input.platform,
      lastSeenAt: new Date(),
    },
  });

  return {
    id: device.id,
    userId: device.userId,
    platform: device.platform as PushPlatform,
    lastSeenAt: device.lastSeenAt.toISOString(),
  };
}

/**
 * Elimina el dispositivo asociado al token para el usuario especificado (llamado en signOut).
 */
export async function unregisterPushDevice(userId: string, token: string): Promise<number> {
  const result = await prisma.pushDevice.deleteMany({
    where: { token, userId },
  });
  return result.count;
}

/**
 * Lista las notificaciones del usuario autenticado (bajo RLS), ordenadas por sentAt desc.
 */
export async function listNotifications(auth: AuthContext): Promise<NotificationResponse[]> {
  const rows = await withUser(auth.userId, (tx) =>
    tx.notification.findMany({
      where: { userId: auth.userId },
      orderBy: { sentAt: 'desc' },
      take: 100,
    }),
  );

  return rows.map((n) => ({
    id: n.id,
    userId: n.userId,
    type: n.type,
    entityType: n.entityType,
    entityId: n.entityId,
    sentAt: n.sentAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  }));
}

/**
 * Marca una notificación como leída.
 * Si no existe o pertenece a otro usuario, falla con 404 (garantizado por RLS).
 */
export async function markNotificationRead(
  auth: AuthContext,
  id: string,
): Promise<NotificationResponse> {
  return withUser(auth.userId, async (tx) => {
    const existing = await tx.notification.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== auth.userId) {
      throw HttpError.notFound('Notificación no encontrada');
    }

    if (existing.readAt) {
      return {
        id: existing.id,
        userId: existing.userId,
        type: existing.type,
        entityType: existing.entityType,
        entityId: existing.entityId,
        sentAt: existing.sentAt.toISOString(),
        readAt: existing.readAt.toISOString(),
      };
    }

    const updated = await tx.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      entityType: updated.entityType,
      entityId: updated.entityId,
      sentAt: updated.sentAt.toISOString(),
      readAt: updated.readAt ? updated.readAt.toISOString() : null,
    };
  });
}

/**
 * Despacha un lote de notificaciones push usando expo-server-sdk.
 * Elimina automáticamente de push_devices cualquier token que responda DeviceNotRegistered.
 */
export async function dispatchExpoPush(messages: readonly ExpoPushMessage[]): Promise<void> {
  const validMessages = messages.filter((m) =>
    Array.isArray(m.to)
      ? m.to.every((token) => Expo.isExpoPushToken(token))
      : Expo.isExpoPushToken(m.to),
  );

  if (validMessages.length === 0) return;

  const chunks = expoClient.chunkPushNotifications([...validMessages]);
  for (const chunk of chunks) {
    try {
      const tickets = await expoClient.sendPushNotificationsAsync(chunk);
      const tokensToDelete: string[] = [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const item = chunk[idx];
          if (ticket.details?.expoPushToken) {
            tokensToDelete.push(ticket.details.expoPushToken);
          } else if (item && typeof item.to === 'string') {
            tokensToDelete.push(item.to);
          } else if (item && Array.isArray(item.to)) {
            tokensToDelete.push(...item.to);
          }
        }
      });

      if (tokensToDelete.length > 0) {
        await prisma.pushDevice.deleteMany({
          where: { token: { in: tokensToDelete } },
        });
      }
    } catch (err) {
      console.error('Error al enviar lote de notificaciones push via Expo:', err);
    }
  }
}

/**
 * Notifica a los profesionales asignados con vínculo 'atiende' vigente sobre alertas nuevas (NK-36).
 *
 * 1. Base de datos (con await): crea filas en `notifications` usando `createMany` (sin RETURNING,
 *    evitando fallos de RLS al insertar desde un cuidador) y llama a `markAlertsNotified` para
 *    transicionar `GENERATED -> PENDING_REVIEW`. Todo envuelto en try/catch para no abortar el control.
 * 2. Push externo: dispara el envío a Expo en segundo plano sin bloquear la respuesta HTTP.
 */
export async function notifyNewAlerts(
  actorUserId: string,
  alertIds: readonly string[],
): Promise<void> {
  if (alertIds.length === 0) return;

  const pushPayloads: {
    professionalId: string;
    alertId: string;
    notificationId: string;
  }[] = [];

  try {
    await withUser(actorUserId, async (tx) => {
      const alerts = await tx.alert.findMany({
        where: { id: { in: [...alertIds] }, status: 'GENERATED' },
        include: {
          indicatorResult: {
            include: {
              checkup: {
                select: { childId: true },
              },
            },
          },
        },
      });

      if (alerts.length === 0) return;

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const notificationsToCreate: Prisma.NotificationCreateManyInput[] = [];
      const alertsToTransition: { alertId: string; professionalId: string }[] = [];

      for (const alert of alerts) {
        const childId = alert.indicatorResult.checkup.childId;
        const activeLinks = await tx.professionalChild.findMany({
          where: {
            childId,
            startDate: { lte: today },
            OR: [{ endDate: null }, { endDate: { gte: today } }],
          },
          select: { professionalId: true },
        });

        const firstLink = activeLinks[0];
        if (firstLink) {
          alertsToTransition.push({
            alertId: alert.id,
            professionalId: firstLink.professionalId,
          });

          for (const link of activeLinks) {
            const notifId = crypto.randomUUID();
            notificationsToCreate.push({
              id: notifId,
              userId: link.professionalId,
              type: NOTIFICATION_TYPES.ALERT_NEW,
              entityType: NOTIFICATION_ENTITY_TYPES.ALERT,
              entityId: alert.id,
              sentAt: new Date(),
            });

            pushPayloads.push({
              professionalId: link.professionalId,
              alertId: alert.id,
              notificationId: notifId,
            });
          }
        }
      }

      if (notificationsToCreate.length > 0) {
        await tx.notification.createMany({
          data: notificationsToCreate,
        });
      }

      for (const item of alertsToTransition) {
        await markAlertsNotified(tx, [item.alertId], item.professionalId);
      }
    });
  } catch (err) {
    console.error('Error al guardar notificaciones de alertas nuevas en BD:', err);
    return;
  }

  // Despacho push a Expo en segundo plano
  if (pushPayloads.length > 0) {
    void (async () => {
      try {
        const profIds = Array.from(new Set(pushPayloads.map((p) => p.professionalId)));
        const devices = await prisma.pushDevice.findMany({
          where: { userId: { in: profIds } },
        });

        if (devices.length === 0) return;

        const messages: ExpoPushMessage[] = [];
        for (const item of pushPayloads) {
          const userDevices = devices.filter((d) => d.userId === item.professionalId);
          for (const dev of userDevices) {
            if (!Expo.isExpoPushToken(dev.token)) continue;
            messages.push({
              to: dev.token,
              sound: 'default',
              channelId: 'default',
              title: 'NutriKids',
              body: 'Tienes una alerta pendiente de revisión',
              data: {
                alertId: item.alertId,
                notificationId: item.notificationId,
                type: NOTIFICATION_TYPES.ALERT_NEW,
              },
            });
          }
        }

        if (messages.length > 0) {
          await dispatchExpoPush(messages);
        }
      } catch (pushErr) {
        console.error('Error al despachar push de alertas nuevas:', pushErr);
      }
    })();
  }
}
