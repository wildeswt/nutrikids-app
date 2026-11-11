import { CreateChildInputSchema, type CreateChildInput } from '@nutrikids/shared';
import { Router } from 'express';
import { requirePermission, requireRole, requireVinculo } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { createChild, getChildById, listChildren } from '../services/children.service.js';

export function createChildrenRouter(): Router {
  const router = Router();

  // Exige token de acceso en todas las rutas de /children
  router.use(authenticate);

  /**
   * POST /children
   * Alta del niño (solo cuidador representante legal).
   * Requiere rol CAREGIVER y body con datos mínimos, parentesco y representante legal.
   */
  router.post(
    '/',
    requireRole('CAREGIVER'),
    validateRequest({ body: CreateChildInputSchema }),
    async (req, res) => {
      const child = await createChild(req.auth!, req.body as CreateChildInput);
      res.status(201).json(child);
    },
  );

  /**
   * GET /children
   * Devuelve solo los niños vinculados al usuario autenticado:
   * - Cuidador: niños de `cuida`
   * - Profesional: niños de `atiende` con vínculo vigente hoy
   */
  router.get('/', requirePermission('child:read'), async (req, res) => {
    const children = await listChildren(req.auth!);
    res.status(200).json(children);
  });

  /**
   * GET /children/:childId
   * Devuelve los datos mínimos de un niño específico.
   * Requiere vínculo vigente (cuidador vía cuida o profesional vía atiende).
   */
  router.get(
    '/:childId',
    requirePermission('child:read'),
    requireVinculo('childId'),
    async (req, res) => {
      const child = await getChildById(req.auth!, req.params.childId as string);
      res.status(200).json(child);
    },
  );

  return router;
}
