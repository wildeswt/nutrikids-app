import {
  CreateReminderInputSchema,
  ListRemindersQuerySchema,
  ReminderParamsSchema,
  type CreateReminderInput,
  type ListRemindersQuery,
  type ReminderParams,
} from '@nutrikids/shared';
import { Router } from 'express';
import { requireActiveConsent, requireLink } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { completeReminder, createReminder, listReminders } from '../services/reminders.service.js';

/**
 * Recordatorios de controles y actividades (NK-37). Los consume la pantalla «Recordatorios».
 */
export function createRemindersRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * GET /reminders?childId=&status=
   * Lista los recordatorios de los niños a los que el usuario tiene acceso (RLS).
   */
  router.get('/', validateRequest({ query: ListRemindersQuerySchema }), async (req, res) => {
    res.status(200).json(await listReminders(req.auth!, req.query as ListRemindersQuery));
  });

  /**
   * POST /reminders
   * Crea un recordatorio para un niño vinculado y con consentimiento vigente. Idempotente por
   * `id` del cliente (reenvío → 200).
   */
  router.post(
    '/',
    validateRequest({ body: CreateReminderInputSchema }),
    requireLink((req) => (req.body as CreateReminderInput).childId),
    requireActiveConsent((req) => (req.body as CreateReminderInput).childId),
    async (req, res) => {
      const { reminder, created } = await createReminder(
        req.auth!,
        req.body as CreateReminderInput,
      );
      res.status(created ? 201 : 200).json(reminder);
    },
  );

  /**
   * PATCH /reminders/:id/complete
   * Marca el recordatorio como realizado.
   */
  router.patch(
    '/:id/complete',
    validateRequest({ params: ReminderParamsSchema }),
    async (req, res) => {
      const { id } = req.params as ReminderParams;
      res.status(200).json(await completeReminder(req.auth!, id));
    },
  );

  return router;
}
