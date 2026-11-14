import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema, requiredText } from './common.js';

/**
 * Mensajes entre cuidador y profesionales vinculados, y derivaciones entre profesionales
 * (NK-38, RF-19). Todo mensaje pertenece a un niño: el vínculo vigente con él, de ambas partes,
 * es lo que permite escribir y leer.
 */

export const MESSAGE_KINDS = ['message', 'referral'] as const;

export const MessageKindSchema = z.enum(MESSAGE_KINDS);

export type MessageKind = z.infer<typeof MessageKindSchema>;

export const MESSAGE_BODY_MAX_LENGTH = 2000;

export const MessageBodySchema = requiredText(MESSAGE_BODY_MAX_LENGTH);

// ---------- Entrada ----------

/** `POST /messages`. El `id` lo genera el cliente: reenviarlo es idempotente. */
export const SendMessageInputSchema = z.strictObject({
  id: UuidSchema,
  childId: UuidSchema,
  recipientId: UuidSchema,
  body: MessageBodySchema,
});

/** `POST /referrals`. `body` es el motivo de la derivación. */
export const CreateReferralInputSchema = SendMessageInputSchema;

/** `GET /messages?childId=&withUserId=&cursor=&limit=`: hilo con una persona sobre un niño. */
export const ListMessagesQuerySchema = z.object({
  childId: UuidSchema,
  withUserId: UuidSchema,
  /** `nextCursor` de la página anterior (id del último mensaje recibido). */
  cursor: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** `PATCH /messages/read`: marca como leídos los mensajes recibidos en un hilo. */
export const MarkThreadReadInputSchema = z.strictObject({
  childId: UuidSchema,
  withUserId: UuidSchema,
});

export const MessageParamsSchema = z.object({
  id: UuidSchema,
});

/** `GET /referrals?childId=&box=`. Sin `box` devuelve enviadas y recibidas. */
export const ListReferralsQuerySchema = z.object({
  childId: UuidSchema.optional(),
  box: z.enum(['sent', 'received']).optional(),
});

export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type CreateReferralInput = z.infer<typeof CreateReferralInputSchema>;
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export type MarkThreadReadInput = z.infer<typeof MarkThreadReadInputSchema>;
export type MessageParams = z.infer<typeof MessageParamsSchema>;
export type ListReferralsQuery = z.infer<typeof ListReferralsQuerySchema>;

// ---------- Salida ----------

export const MessageResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  senderId: UuidSchema,
  recipientId: UuidSchema,
  kind: MessageKindSchema,
  body: z.string(),
  sentAt: IsoDateTimeSchema,
  readAt: IsoDateTimeSchema.nullable(),
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;

/** Persona al otro lado de una conversación. `specialty` solo si es profesional. */
export const MessageParticipantSchema = z.object({
  userId: UuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['CAREGIVER', 'PROFESSIONAL']),
  specialty: z.string().nullable(),
});

export type MessageParticipant = z.infer<typeof MessageParticipantSchema>;

/** Conversación = un niño + otra persona. Ordenadas por el último mensaje, el más reciente primero. */
export const ConversationResponseSchema = z.object({
  childId: UuidSchema,
  participant: MessageParticipantSchema,
  lastMessage: MessageResponseSchema,
  unreadCount: z.number().int().nonnegative(),
});

export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;

/** Página de un hilo, del más reciente al más antiguo. `nextCursor` es `null` en la última. */
export const MessagePageResponseSchema = z.object({
  items: z.array(MessageResponseSchema),
  nextCursor: UuidSchema.nullable(),
});

export type MessagePageResponse = z.infer<typeof MessagePageResponseSchema>;

export const ReferralResponseSchema = MessageResponseSchema.extend({
  sender: MessageParticipantSchema,
  recipient: MessageParticipantSchema,
});

export type ReferralResponse = z.infer<typeof ReferralResponseSchema>;

/** `GET /messages/conversations?childId=` (opcional: filtra por niño). */
export const ListConversationsQuerySchema = z.object({
  childId: UuidSchema.optional(),
});

export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;
