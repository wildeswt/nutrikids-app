import {
  ListAlertsQuerySchema,
  UpdateAlertStatusInputSchema,
  UuidSchema,
  type ListAlertsQuery,
  type UpdateAlertStatusInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../middlewares/access.js';
import { auditHealth } from '../middlewares/auditHealth.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { getAlert, listAlerts, updateAlertStatus } from '../services/alerts.service.js';

const AlertParamsSchema = z.object({ alertId: UuidSchema });

/**
 * Alertas de riesgo (NK-30). Solo para profesionales (`alert:review`): la alerta muestra el
 * puntaje z, que los cuidadores no reciben (RF-14). El vínculo `atiende` vigente con el niño
 * lo verifica el servicio (un vínculo como cuidador no basta).
 */
export function createAlertsRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * GET /alerts?status=GENERATED,PENDING_REVIEW&childId=...
   * Bandeja: alertas de los niños vinculados, ordenadas por gravedad, tipo de riesgo y antigüedad.
   */
  router.get(
    '/',
    requirePermission('alert:review'),
    validateRequest({ query: ListAlertsQuerySchema }),
    auditHealth({ action: 'READ', entityType: 'alerts', getEntityId: () => null }),
    async (req, res) => {
      const alerts = await listAlerts(req.auth!, req.query as unknown as ListAlertsQuery);
      res.status(200).json(alerts);
    },
  );

  /** GET /alerts/:alertId: detalle con historial de estados. */
  router.get(
    '/:alertId',
    requirePermission('alert:review'),
    validateRequest({ params: AlertParamsSchema }),
    auditHealth({
      action: 'READ',
      entityType: 'alerts',
      getEntityId: (req) => req.params.alertId as string,
    }),
    async (req, res) => {
      res.status(200).json(await getAlert(req.auth!, req.params.alertId as string));
    },
  );

  /** PATCH /alerts/:alertId/status: cambia el estado según la máquina de estados. */
  router.patch(
    '/:alertId/status',
    requirePermission('alert:review'),
    validateRequest({ params: AlertParamsSchema, body: UpdateAlertStatusInputSchema }),
    auditHealth({
      action: 'REVIEW',
      entityType: 'alerts',
      getEntityId: (req) => req.params.alertId as string,
    }),
    async (req, res) => {
      const { status } = req.body as UpdateAlertStatusInput;
      res
        .status(200)
        .json(await updateAlertStatus(req.auth!, req.params.alertId as string, status));
    },
  );

  return router;
}
