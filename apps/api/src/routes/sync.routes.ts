import { SyncCheckupsInputSchema, type SyncCheckupsInput } from '@nutrikids/shared';
import { Router } from 'express';
import { requirePermission } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { syncCheckups } from '../services/sync.service.js';

export function createSyncRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * POST /sync/checkups
   * Sincroniza un lote de controles registrados sin conexión (RT-02). Cada control se inserta de
   * forma idempotente por su `id` y en su propia transacción: un control con error no hace perder
   * el resto. Responde siempre 200 con el estado de cada control (`CREATED`, `DUPLICATE`, `ERROR`)
   * y los resultados recalculados por el servidor. El vínculo y el consentimiento se verifican
   * por control; la auditoría (`CREATE` y `DISCREPANCY`) se registra en el servicio.
   */
  router.post(
    '/checkups',
    requirePermission('checkup:create'),
    validateRequest({ body: SyncCheckupsInputSchema }),
    async (req, res) => {
      const { checkups } = req.body as SyncCheckupsInput;
      const response = await syncCheckups(req.auth!, checkups);
      res.status(200).json(response);
    },
  );

  return router;
}
