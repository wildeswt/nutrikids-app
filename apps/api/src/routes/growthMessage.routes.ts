import { GrowthMessageParamsSchema } from '@nutrikids/shared';
import { Router } from 'express';
import { requireLink } from '../middlewares/access.js';
import { auditHealth } from '../middlewares/auditHealth.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { getGrowthMessage } from '../services/growthMessage.service.js';

/**
 * Mensaje de crecimiento para el cuidador (NK-35). Se monta bajo `/children`; las rutas
 * llevan sus propios middlewares porque comparten el prefijo con el router principal.
 */
export function createGrowthMessageRouter(): Router {
  const router = Router();

  /**
   * GET /children/:childId/growth-message
   * Estado de crecimiento en lenguaje sencillo: `ok`, o `reviewed` con orientación y próximo
   * control una vez que el profesional revisó la alerta. Sin valores técnicos.
   */
  router.get(
    '/:childId/growth-message',
    authenticate,
    validateRequest({ params: GrowthMessageParamsSchema }),
    requireLink('childId'),
    auditHealth({ action: 'READ', entityType: 'children' }),
    async (req, res) => {
      res.status(200).json(await getGrowthMessage(req.auth!, req.params.childId as string));
    },
  );

  return router;
}
