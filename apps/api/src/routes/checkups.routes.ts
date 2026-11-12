import { CorrectCheckupInputSchema, UuidSchema, type CorrectCheckupInput } from '@nutrikids/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { requireActiveConsent, requirePermission, requireVinculo } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { correctCheckup, getCheckupChildId } from '../services/checkups.service.js';

const CheckupParamsSchema = z.object({ checkupId: UuidSchema });

/**
 * Resuelve el niño del control indicado en la ruta y lo deja en `res.locals.checkupChildId`
 * para reutilizar `requireVinculo` y `requireActiveConsent`. Un control inexistente o de un
 * niño sin vínculo (oculto por RLS) responde 404.
 */
const loadCheckupChild: RequestHandler = async (req, res, next) => {
  try {
    const parsed = UuidSchema.safeParse(req.params.checkupId);
    if (!parsed.success) {
      throw HttpError.badRequest('Identificador de control inválido');
    }
    res.locals.checkupChildId = await getCheckupChildId(req.auth!, parsed.data);
    next();
  } catch (err) {
    next(err);
  }
};

const checkupChildId = (req: { res?: { locals: Record<string, unknown> } }): unknown =>
  req.res?.locals.checkupChildId;

export function createCheckupsRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * POST /checkups/:checkupId/correction
   * Corrige un control creando uno nuevo que apunta al original con `correctedCheckupId`.
   * El original no se modifica (inmutable) y deja de ser vigente. Idempotente por `id` de cliente.
   */
  router.post(
    '/:checkupId/correction',
    requirePermission('checkup:create'),
    validateRequest({ params: CheckupParamsSchema }),
    loadCheckupChild,
    requireVinculo(checkupChildId),
    requireActiveConsent(checkupChildId),
    validateRequest({ body: CorrectCheckupInputSchema }),
    async (req, res) => {
      const { checkup, created } = await correctCheckup(
        req.auth!,
        req.vinculo!,
        req.params.checkupId as string,
        req.body as CorrectCheckupInput,
      );
      res.status(created ? 201 : 200).json(checkup);
    },
  );

  return router;
}
