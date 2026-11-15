import { ProfessionalLookupQuerySchema, type ProfessionalLookupQuery } from '@nutrikids/shared';
import { Router } from 'express';
import { requireRole } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createLookupRateLimiter } from '../middlewares/rateLimit.js';
import { validateRequest } from '../middlewares/validate.js';
import { lookupProfessionalByLicense } from '../services/professionals.service.js';

export function createProfessionalsRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * GET /professionals/lookup?license=...
   * Busca un profesional por su registro para vincularlo a un niño (solo cuidadores).
   * Devuelve id, nombre, apellido y especialidad; con límite de intentos y auditoría.
   */
  router.get(
    '/lookup',
    requireRole('CAREGIVER'),
    createLookupRateLimiter(),
    validateRequest({ query: ProfessionalLookupQuerySchema }),
    async (req, res) => {
      const { license } = req.query as unknown as ProfessionalLookupQuery;
      const professional = await lookupProfessionalByLicense(req.auth!.userId, license);
      res.status(200).json(professional);
    },
  );

  return router;
}
