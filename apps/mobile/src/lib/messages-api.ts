import {
  ConversationResponseSchema,
  ListConversationsQuerySchema,
  ListMessagesQuerySchema,
  MarkThreadReadInputSchema,
  MessagePageResponseSchema,
  MessageResponseSchema,
  ProfessionalAssignmentResponseSchema,
  SendMessageInputSchema,
  UuidSchema,
  todayIsoDate,
  type ConversationResponse,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type MarkThreadReadInput,
  type MessagePageResponse,
  type MessageResponse,
  type ProfessionalAssignmentResponse,
  type SendMessageInput,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

const MarkThreadReadResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
});

export type MarkThreadReadResponse = z.infer<typeof MarkThreadReadResponseSchema>;

/** Error devuelto por los endpoints de mensajes, conservando el código HTTP `status`. */
export class MessageApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MessageApiError';
    this.status = status;
  }
}

/** Error de red cuando la petición no pudo llegar al servidor (sin conexión o tiempo agotado). */
export class MessageNetworkError extends Error {
  constructor(message: string = i18n.t('errors:messages.network'), options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MessageNetworkError';
  }
}

/** Indica si el error corresponde a una falla de red/conexión y no a una respuesta HTTP. */
export function isMessageNetworkError(err: unknown): boolean {
  if (err instanceof MessageNetworkError) return true;
  if (err instanceof MessageApiError) return false;
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    return /network|fetch|internet|conexi[oó]n|offline|timeout|abort/i.test(err.message);
  }
  return false;
}

/** Traduce un error de mensajes a un mensaje claro en el idioma activo. */
export function getMessageErrorMessage(err: unknown, fallback: string): string {
  if (isMessageNetworkError(err)) {
    return i18n.t('errors:messages.network');
  }
  if (err instanceof MessageApiError) {
    if (err.status === 403) {
      return err.message || i18n.t('errors:messages.forbidden');
    }
    if (err.status === 409) {
      return err.message || i18n.t('errors:messages.conflict');
    }
    return err.message || fallback;
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return fallback;
}

async function requestMessages(
  path: string,
  init: RequestInit | undefined,
  fallbackMessage: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await authFetch(path, init);
  } catch (err) {
    throw new MessageNetworkError(i18n.t('errors:messages.network'), { cause: err });
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const statusFallback =
      response.status === 403
        ? i18n.t('errors:messages.forbidden')
        : response.status === 409
          ? i18n.t('errors:messages.conflict')
          : fallbackMessage;
    throw new MessageApiError(parseApiError(payload, statusFallback).message, response.status);
  }

  return response.json();
}

/** Lista las conversaciones del usuario autenticado (`GET /messages/conversations`). */
export async function fetchConversations(
  query: ListConversationsQuery = {},
): Promise<ConversationResponse[]> {
  const validated = ListConversationsQuerySchema.parse(query);
  const search = validated.childId ? `?childId=${encodeURIComponent(validated.childId)}` : '';
  const rawJson = await requestMessages(
    `/messages/conversations${search}`,
    undefined,
    i18n.t('errors:messages.conversations'),
  );
  return z.array(ConversationResponseSchema).parse(rawJson);
}

/** Obtiene una página del hilo con una persona sobre un niño (`GET /messages`), más reciente primero. */
export async function fetchMessages(
  query: z.input<typeof ListMessagesQuerySchema>,
): Promise<MessagePageResponse> {
  const validated: ListMessagesQuery = ListMessagesQuerySchema.parse(query);
  const params = new URLSearchParams({
    childId: validated.childId,
    withUserId: validated.withUserId,
    limit: String(validated.limit),
  });
  if (validated.cursor) {
    params.set('cursor', validated.cursor);
  }

  const rawJson = await requestMessages(
    `/messages?${params.toString()}`,
    undefined,
    i18n.t('errors:messages.thread'),
  );
  return MessagePageResponseSchema.parse(rawJson);
}

/** Envía un mensaje (`POST /messages`). Idempotente por `id` generado en el cliente. */
export async function sendMessageApi(input: SendMessageInput): Promise<MessageResponse> {
  const validatedBody = SendMessageInputSchema.parse(input);
  const rawJson = await requestMessages(
    '/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedBody),
    },
    i18n.t('errors:messages.send'),
  );
  return MessageResponseSchema.parse(rawJson);
}

/** Marca como leídos los mensajes recibidos de un hilo (`PATCH /messages/read`). */
export async function markThreadReadApi(
  input: MarkThreadReadInput,
): Promise<MarkThreadReadResponse> {
  const validatedBody = MarkThreadReadInputSchema.parse(input);
  const rawJson = await requestMessages(
    '/messages/read',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedBody),
    },
    i18n.t('errors:messages.markRead'),
  );
  return MarkThreadReadResponseSchema.parse(rawJson);
}

/** Lista los profesionales vinculados a un niño (`GET /children/:childId/professionals`). */
export async function fetchChildProfessionals(
  childId: string,
): Promise<ProfessionalAssignmentResponse[]> {
  const validChildId = UuidSchema.parse(childId);
  const rawJson = await requestMessages(
    `/children/${encodeURIComponent(validChildId)}/professionals`,
    undefined,
    i18n.t('errors:messages.professionals'),
  );
  return z.array(ProfessionalAssignmentResponseSchema).parse(rawJson);
}

/** Filtra asignaciones vigentes hoy y elimina duplicados por `professionalId`. */
export function filterActiveProfessionals(
  assignments: readonly ProfessionalAssignmentResponse[],
  today: string = todayIsoDate(),
): ProfessionalAssignmentResponse[] {
  const seen = new Set<string>();
  const active: ProfessionalAssignmentResponse[] = [];
  for (const item of assignments) {
    const isActive = item.startDate <= today && (!item.endDate || item.endDate >= today);
    if (!isActive || seen.has(item.professionalId)) continue;
    seen.add(item.professionalId);
    active.push(item);
  }
  return active;
}
