import {
  NotificationParamsSchema,
  RegisterPushDeviceInputSchema,
  type NotificationParams,
  type RegisterPushDeviceInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  listNotifications,
  markNotificationRead,
  registerPushDevice,
  unregisterPushDevice,
} from '../services/notifications.service.js';

const DeviceParamsSchema = z.object({
  token: z.string().trim().min(1),
});

/**
 * Notificaciones internas y registro de dispositivos push (NK-36).
 */
export function createNotificationsRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * POST /notifications/devices
   * Registra o actualiza el token de push del dispositivo para el usuario autenticado.
   */
  router.post(
    '/devices',
    validateRequest({ body: RegisterPushDeviceInputSchema }),
    async (req, res) => {
      const input = req.body as RegisterPushDeviceInput;
      const device = await registerPushDevice(req.auth!.userId, input);
      res.status(200).json(device);
    },
  );

  /**
   * DELETE /notifications/devices/:token
   * Elimina el registro del token de push (al cerrar sesión).
   */
  router.delete(
    '/devices/:token',
    validateRequest({ params: DeviceParamsSchema }),
    async (req, res) => {
      await unregisterPushDevice(req.auth!.userId, req.params.token as string);
      res.status(204).send();
    },
  );

  /**
   * GET /notifications
   * Lista las notificaciones del usuario autenticado (bajo RLS).
   */
  router.get('/', async (req, res) => {
    const notifications = await listNotifications(req.auth!);
    res.status(200).json(notifications);
  });

  /**
   * PATCH /notifications/:id/read
   * Marca una notificación como leída.
   */
  router.patch(
    '/:id/read',
    validateRequest({ params: NotificationParamsSchema }),
    async (req, res) => {
      const { id } = req.params as NotificationParams;
      const updated = await markNotificationRead(req.auth!, id);
      res.status(200).json(updated);
    },
  );

  return router;
}
