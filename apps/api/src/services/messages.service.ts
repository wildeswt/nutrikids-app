import crypto from 'node:crypto';
import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  type ConversationResponse,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type ListReferralsQuery,
  type MarkThreadReadInput,
  type MessageKind,
  type MessagePageResponse,
  type MessageParticipant,
  type MessageResponse,
  type ReferralResponse,
  type SendMessageInput,
} from '@nutrikids/shared';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { prisma, withUser } from '../lib/prisma.js';
import { dispatchExpoPush } from './notifications.service.js';
import { decryptUserNames } from './pii.service.js';

/**
 * Mensajes y derivaciones (NK-38, RF-19). Quién puede escribir a quién y quién puede leer lo
 * decide la base de datos (`app_can_message` y las políticas RLS de `messages`); aquí se
 * traduce a 403/404 y se genera la notificación interna del destinatario. Ver docs/messages.md.
 */

function format(row: Prisma.MessageGetPayload<object>): MessageResponse {
  return {
    id: row.id,
    childId: row.childId,
    senderId: row.senderId,
    recipientId: row.recipientId,
    kind: row.kind as MessageKind,
    body: row.body,
    sentAt: row.sentAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

const USER_SELECT = {
  id: true,
  firstNameEnc: true,
  lastNameEnc: true,
  professional: { select: { specialty: true } },
} as const satisfies Prisma.UserSelect;

function participant(
  user: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>,
): MessageParticipant {
  const specialty = user.professional?.specialty ?? null;
  const { firstName, lastName } = decryptUserNames({
    firstNameEnc: user.firstNameEnc,
    lastNameEnc: user.lastNameEnc,
  });
  return {
    userId: user.id,
    firstName,
    lastName,
    role: specialty ? 'PROFESSIONAL' : 'CAREGIVER',
    specialty,
  };
}

export interface MessageWriteResult {
  message: MessageResponse;
  /** `false` si fue un reenvío idempotente del mismo `id`. */
  created: boolean;
}

/**
 * Envía un mensaje o una derivación. Idempotente por el `id` del cliente. Sin vínculo de alguna
 * de las partes con el niño (o cuidador con cuidador, o derivación a quien no es profesional
 * del niño) → 403. Crea la notificación interna del destinatario en la misma transacción.
 */
export async function sendMessage(
  auth: AuthContext,
  input: SendMessageInput,
  kind: MessageKind,
): Promise<MessageWriteResult> {
  let result: MessageWriteResult;
  try {
    result = await withUser(auth.userId, async (tx) => {
      const existing = await tx.message.findUnique({ where: { id: input.id } });
      if (existing) {
        if (
          existing.senderId !== auth.userId ||
          existing.childId !== input.childId ||
          existing.recipientId !== input.recipientId ||
          existing.kind !== kind ||
          existing.body !== input.body
        ) {
          throw HttpError.conflict('Ya existe un mensaje con ese identificador');
        }
        return { message: format(existing), created: false };
      }

      const allowed = await tx.$queryRaw<{ ok: boolean | null }[]>`
        SELECT app_can_message(${input.childId}::uuid, ${input.recipientId}::uuid, ${kind}) AS ok
      `;
      if (!allowed[0]?.ok) {
        throw HttpError.forbidden(
          kind === 'referral'
            ? 'Solo puedes derivar a otro profesional vinculado al mismo niño'
            : 'Solo puedes escribir a personas vinculadas a este niño',
        );
      }

      const row = await tx.message.create({
        data: {
          id: input.id,
          childId: input.childId,
          senderId: auth.userId,
          recipientId: input.recipientId,
          kind,
          body: input.body,
        },
      });
      await tx.notification.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            userId: input.recipientId,
            type: notificationType(kind),
            entityType: NOTIFICATION_ENTITY_TYPES.MESSAGE,
            entityId: row.id,
          },
        ],
      });
      return { message: format(row), created: true };
    });
  } catch (err) {
    // Mismo id usado en una conversación que este usuario no ve (RLS): no revelar nada más.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw HttpError.conflict('Ya existe un mensaje con ese identificador');
    }
    throw err;
  }

  if (result.created) void pushNewMessage(result.message);
  return result;
}

function notificationType(kind: MessageKind): string {
  return kind === 'referral' ? NOTIFICATION_TYPES.REFERRAL_NEW : NOTIFICATION_TYPES.MESSAGE_NEW;
}

/** Push al destinatario. Sin contenido del mensaje: el cuerpo solo se ve dentro de la app. */
async function pushNewMessage(message: MessageResponse): Promise<void> {
  try {
    const devices = await prisma.pushDevice.findMany({ where: { userId: message.recipientId } });
    const messages: ExpoPushMessage[] = devices
      .filter((d) => Expo.isExpoPushToken(d.token))
      .map((d) => ({
        to: d.token,
        sound: 'default' as const,
        channelId: 'default',
        title: 'NutriKids',
        body:
          message.kind === 'referral' ? 'Tienes una derivación nueva' : 'Tienes un mensaje nuevo',
        data: {
          messageId: message.id,
          childId: message.childId,
          type: notificationType(message.kind),
          entityType: NOTIFICATION_ENTITY_TYPES.MESSAGE,
        },
      }));
    if (messages.length > 0) await dispatchExpoPush(messages);
  } catch (err) {
    console.error('Error al enviar push de mensaje:', err);
  }
}

interface ConversationRow {
  id: string;
  child_id: string;
  sender_id: string;
  recipient_id: string;
  kind: string;
  body: string;
  sent_at: Date;
  read_at: Date | null;
  other_id: string;
  first_name: string;
  last_name: string;
  specialty: string | null;
  unread: number;
}

/** Conversaciones (niño + otra persona) con el último mensaje y los no leídos, más recientes primero. */
export async function listConversations(
  auth: AuthContext,
  query: ListConversationsQuery,
): Promise<ConversationResponse[]> {
  const childId = query.childId ?? null;
  const rows = await withUser(
    auth.userId,
    (tx) => tx.$queryRaw<ConversationRow[]>`
      SELECT l.id, l.child_id, l.sender_id, l.recipient_id, l.kind, l.body, l.sent_at, l.read_at,
             l.other_id, u.first_name, u.last_name, p.specialty,
             COALESCE(un.n, 0)::int AS unread
        FROM (
          SELECT DISTINCT ON (m.child_id, o.other_id) m.*, o.other_id
            FROM messages m
           CROSS JOIN LATERAL (
             SELECT CASE WHEN m.sender_id = app_user_id() THEN m.recipient_id ELSE m.sender_id END AS other_id
           ) o
           WHERE (${childId}::uuid IS NULL OR m.child_id = ${childId}::uuid)
           ORDER BY m.child_id, o.other_id, m.sent_at DESC, m.id DESC
        ) l
        JOIN users u ON u.id = l.other_id
        LEFT JOIN professionals p ON p.user_id = u.id
        LEFT JOIN (
          SELECT child_id, sender_id, count(*) AS n
            FROM messages
           WHERE recipient_id = app_user_id() AND read_at IS NULL
           GROUP BY child_id, sender_id
        ) un ON un.child_id = l.child_id AND un.sender_id = l.other_id
       ORDER BY l.sent_at DESC, l.id DESC
       LIMIT 100
    `,
  );

  return rows.map((r) => {
    const { firstName, lastName } = decryptUserNames({
      firstNameEnc: r.first_name,
      lastNameEnc: r.last_name,
    });
    return {
      childId: r.child_id,
      participant: {
        userId: r.other_id,
        firstName,
        lastName,
        role: r.specialty ? 'PROFESSIONAL' : 'CAREGIVER',
        specialty: r.specialty,
      },
      lastMessage: {
        id: r.id,
        childId: r.child_id,
        senderId: r.sender_id,
        recipientId: r.recipient_id,
        kind: r.kind as MessageKind,
        body: r.body,
        sentAt: r.sent_at.toISOString(),
        readAt: r.read_at ? r.read_at.toISOString() : null,
      },
      unreadCount: r.unread,
    };
  });
}

/** Hilo con una persona sobre un niño, del más reciente al más antiguo, paginado por cursor. */
export async function listMessages(
  auth: AuthContext,
  query: ListMessagesQuery,
): Promise<MessagePageResponse> {
  const rows = await withUser(auth.userId, (tx) =>
    tx.message.findMany({
      where: {
        childId: query.childId,
        OR: [
          { senderId: auth.userId, recipientId: query.withUserId },
          { senderId: query.withUserId, recipientId: auth.userId },
        ],
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }),
  );

  const page = rows.slice(0, query.limit);
  return {
    items: page.map(format),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** Marca como leídos (y sus notificaciones) los mensajes recibidos de una persona sobre un niño. */
export async function markThreadRead(
  auth: AuthContext,
  input: MarkThreadReadInput,
): Promise<{ updated: number }> {
  return withUser(auth.userId, async (tx) => {
    const unread = await tx.message.findMany({
      where: {
        childId: input.childId,
        senderId: input.withUserId,
        recipientId: auth.userId,
        readAt: null,
      },
      select: { id: true },
    });
    const updated = await markRead(
      tx,
      auth.userId,
      unread.map((m) => m.id),
    );
    return { updated };
  });
}

/** Marca un mensaje recibido como leído. Inexistente, ajeno o propio → 404. Idempotente. */
export async function markMessageRead(auth: AuthContext, id: string): Promise<MessageResponse> {
  return withUser(auth.userId, async (tx) => {
    const existing = await tx.message.findUnique({ where: { id } });
    if (!existing || existing.recipientId !== auth.userId) {
      throw HttpError.notFound('Mensaje no encontrado');
    }
    if (existing.readAt) return format(existing);
    await markRead(tx, auth.userId, [id]);
    return format(await tx.message.findUniqueOrThrow({ where: { id } }));
  });
}

async function markRead(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const now = new Date();
  const { count } = await tx.message.updateMany({
    where: { id: { in: ids }, recipientId: userId, readAt: null },
    data: { readAt: now },
  });
  await tx.notification.updateMany({
    where: {
      userId,
      entityType: NOTIFICATION_ENTITY_TYPES.MESSAGE,
      entityId: { in: ids },
      readAt: null,
    },
    data: { readAt: now },
  });
  return count;
}

/** Derivaciones enviadas y/o recibidas por el profesional, las más recientes primero. */
export async function listReferrals(
  auth: AuthContext,
  query: ListReferralsQuery,
): Promise<ReferralResponse[]> {
  const rows = await withUser(auth.userId, (tx) =>
    tx.message.findMany({
      where: {
        kind: 'referral',
        ...(query.childId ? { childId: query.childId } : {}),
        ...(query.box === 'sent'
          ? { senderId: auth.userId }
          : query.box === 'received'
            ? { recipientId: auth.userId }
            : {}),
      },
      include: { sender: { select: USER_SELECT }, recipient: { select: USER_SELECT } },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: 100,
    }),
  );
  return rows.map((row) => ({
    ...format(row),
    sender: participant(row.sender),
    recipient: participant(row.recipient),
  }));
}
