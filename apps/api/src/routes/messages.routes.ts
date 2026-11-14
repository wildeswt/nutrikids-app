import {
  CreateReferralInputSchema,
  ListConversationsQuerySchema,
  ListMessagesQuerySchema,
  ListReferralsQuerySchema,
  MarkThreadReadInputSchema,
  MessageParamsSchema,
  SendMessageInputSchema,
  type CreateReferralInput,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type ListReferralsQuery,
  type MarkThreadReadInput,
  type MessageParams,
  type SendMessageInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { requireActiveConsent, requireLink, requireRole } from '../middlewares/access.js';
import { auditHealth } from '../middlewares/auditHealth.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  listConversations,
  listMessages,
  listReferrals,
  markMessageRead,
  markThreadRead,
  sendMessage,
} from '../services/messages.service.js';

/**
 * Mensajes entre cuidador y profesionales vinculados, y entre profesionales (NK-38). Los
 * consumen las pantallas de chat (NK-50). La regla de «quién puede escribir a quién» vive en la
 * base de datos (`app_can_message`); ver docs/messages.md.
 */
export function createMessagesRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /** GET /messages/conversations?childId=: conversaciones con último mensaje y no leídos. */
  router.get(
    '/conversations',
    validateRequest({ query: ListConversationsQuerySchema }),
    async (req, res) => {
      res.status(200).json(await listConversations(req.auth!, req.query as ListConversationsQuery));
    },
  );

  /** GET /messages?childId=&withUserId=&cursor=&limit=: hilo paginado (más reciente primero). */
  router.get(
    '/',
    validateRequest({ query: ListMessagesQuerySchema }),
    requireLink((req) => (req.query as unknown as ListMessagesQuery).childId),
    auditHealth({ action: 'READ', entityType: 'messages', getEntityId: () => null }),
    async (req, res) => {
      res
        .status(200)
        .json(await listMessages(req.auth!, req.query as unknown as ListMessagesQuery));
    },
  );

  /**
   * POST /messages
   * Envía un mensaje. Idempotente por `id` del cliente (reenvío → 200). Ambas partes deben estar
   * vinculadas al niño (403) y el niño debe tener consentimiento vigente (403).
   */
  router.post(
    '/',
    validateRequest({ body: SendMessageInputSchema }),
    requireLink((req) => (req.body as SendMessageInput).childId),
    requireActiveConsent((req) => (req.body as SendMessageInput).childId),
    auditHealth({
      action: 'CREATE',
      entityType: 'messages',
      getEntityId: (req) => (req.body as SendMessageInput).id,
    }),
    async (req, res) => {
      const { message, created } = await sendMessage(
        req.auth!,
        req.body as SendMessageInput,
        'message',
      );
      res.status(created ? 201 : 200).json(message);
    },
  );

  /** PATCH /messages/read: marca como leído un hilo completo (al abrir el chat). */
  router.patch(
    '/read',
    validateRequest({ body: MarkThreadReadInputSchema }),
    requireLink((req) => (req.body as MarkThreadReadInput).childId),
    async (req, res) => {
      res.status(200).json(await markThreadRead(req.auth!, req.body as MarkThreadReadInput));
    },
  );

  /** PATCH /messages/:id/read: marca un mensaje recibido como leído. Idempotente. */
  router.patch('/:id/read', validateRequest({ params: MessageParamsSchema }), async (req, res) => {
    const { id } = req.params as MessageParams;
    res.status(200).json(await markMessageRead(req.auth!, id));
  });

  return router;
}

/** Derivaciones o interconsultas entre profesionales vinculados al mismo niño (NK-38; pantalla NK-51). */
export function createReferralsRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRole('PROFESSIONAL'));

  /** GET /referrals?childId=&box=sent|received: derivaciones del profesional. */
  router.get(
    '/',
    validateRequest({ query: ListReferralsQuerySchema }),
    auditHealth({ action: 'READ', entityType: 'messages', getEntityId: () => null }),
    async (req, res) => {
      res.status(200).json(await listReferrals(req.auth!, req.query as ListReferralsQuery));
    },
  );

  /**
   * POST /referrals
   * Deriva el niño a otro profesional vinculado al mismo niño; `body` es el motivo. Idempotente
   * por `id`. El destinatario recibe una notificación `referral_new`.
   */
  router.post(
    '/',
    validateRequest({ body: CreateReferralInputSchema }),
    requireLink((req) => (req.body as CreateReferralInput).childId),
    requireActiveConsent((req) => (req.body as CreateReferralInput).childId),
    auditHealth({
      action: 'CREATE',
      entityType: 'messages',
      getEntityId: (req) => (req.body as CreateReferralInput).id,
    }),
    async (req, res) => {
      const { message, created } = await sendMessage(
        req.auth!,
        req.body as CreateReferralInput,
        'referral',
      );
      res.status(created ? 201 : 200).json(message);
    },
  );

  return router;
}
