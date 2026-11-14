import {
  ErasureRequestParamsSchema,
  RectifyChildInputSchema,
  UuidSchema,
  type ErasureRequestParams,
  type RectifyChildInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { z } from 'zod';
import { auditHealth } from '../middlewares/auditHealth.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/access.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  cancelErasureRequest,
  createErasureRequest,
  exportChildData,
  listErasureRequests,
  rectifyChild,
} from '../services/dataRights.service.js';

const ChildParamsSchema = z.object({ childId: UuidSchema });

/**
 * Derechos del representante legal sobre los datos del niño (NK-41, RF-20). Se monta bajo
 * `/children`; el servicio comprueba que el usuario sea el representante legal del niño.
 */
export function createDataRightsRouter(): Router {
  const router = Router();

  // Por ruta (no `router.use`): este router comparte el prefijo /children con el principal y no
  // debe responder 403 a rutas que no son suyas.
  const guard = [authenticate, requireRole('CAREGIVER')];

  /** PATCH /children/:childId: rectifica nombre, apellido y (si no hay controles) nacimiento y sexo. */
  router.patch(
    '/:childId',
    ...guard,
    validateRequest({ params: ChildParamsSchema, body: RectifyChildInputSchema }),
    auditHealth({ action: 'UPDATE', entityType: 'children' }),
    async (req, res) => {
      const child = await rectifyChild(
        req.auth!,
        req.params.childId as string,
        req.body as RectifyChildInput,
      );
      res.status(200).json(child);
    },
  );

  /** GET /children/:childId/export: todos los datos del niño como archivo JSON descargable. */
  router.get(
    '/:childId/export',
    ...guard,
    validateRequest({ params: ChildParamsSchema }),
    auditHealth({ action: 'EXPORT', entityType: 'children' }),
    async (req, res) => {
      const childId = req.params.childId as string;
      const data = await exportChildData(req.auth!, childId);
      res.setHeader('Content-Disposition', `attachment; filename="nutrikids-${childId}.json"`);
      res.status(200).json(data);
    },
  );

  /** POST /children/:childId/erasure-requests: registra una solicitud de eliminación. */
  router.post(
    '/:childId/erasure-requests',
    ...guard,
    validateRequest({ params: ChildParamsSchema }),
    auditHealth({
      action: 'CREATE',
      entityType: 'erasure_requests',
      getEntityId: (_req, res) => res.locals.auditEntityId as string | undefined,
    }),
    async (req, res) => {
      const request = await createErasureRequest(req.auth!, req.params.childId as string);
      res.locals.auditEntityId = request.id;
      res.status(201).json(request);
    },
  );

  /** GET /children/:childId/erasure-requests: historial de solicitudes del niño. */
  router.get(
    '/:childId/erasure-requests',
    ...guard,
    validateRequest({ params: ChildParamsSchema }),
    async (req, res) => {
      res.status(200).json(await listErasureRequests(req.auth!, req.params.childId as string));
    },
  );

  /** DELETE /children/:childId/erasure-requests/:requestId: cancela una solicitud pendiente. */
  router.delete(
    '/:childId/erasure-requests/:requestId',
    ...guard,
    validateRequest({ params: ErasureRequestParamsSchema }),
    auditHealth({
      action: 'REVOKE',
      entityType: 'erasure_requests',
      getEntityId: (req) => req.params.requestId as string,
    }),
    async (req, res) => {
      const { childId, requestId } = req.params as ErasureRequestParams;
      res.status(200).json(await cancelErasureRequest(req.auth!, childId, requestId));
    },
  );

  return router;
}
