import { AuditQuerySchema, type AuditQuery } from '@nutrikids/shared';
import { Router } from 'express';
import { requirePermission } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { listAuditLogs } from '../services/audit.service.js';

export function createAuditRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * GET /audit
   * Consulta el registro de auditoría de accesos y modificaciones (NK-21).
   * Autorizado únicamente para profesionales con permiso audit:read.
   */
  router.get(
    '/',
    requirePermission('audit:read'),
    validateRequest({ query: AuditQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as AuditQuery;
      const result = await listAuditLogs(req.auth!, query);
      res.status(200).json(result);
    },
  );

  return router;
}
