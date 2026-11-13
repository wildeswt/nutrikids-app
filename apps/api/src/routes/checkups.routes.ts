import { CorrectCheckupInputSchema, UuidSchema, type CorrectCheckupInput } from '@nutrikids/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { requireActiveConsent, requirePermission, requireLink } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  correctCheckup,
  getCheckupChildId,
  getCheckupResults,
} from '../services/checkups.service.js';

const CheckupParamsSchema = z.object({ checkupId: UuidSchema });

/**
 * Resolves child of the route checkup and stores in `res.locals.checkupChildId`
 * to reuse `requireLink` and `requireActiveConsent`. Non-existent checkup or unlinked
 * child returns 404 via RLS.
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
   * Corrects a checkup by creating a new one pointing to the original with `correctedCheckupId`.
   * Original remains unchanged (immutable) and ceases to be current. Idempotent by client `id`.
   */
  router.post(
    '/:checkupId/correction',
    requirePermission('checkup:create'),
    validateRequest({ params: CheckupParamsSchema }),
    loadCheckupChild,
    requireLink(checkupChildId),
    requireActiveConsent(checkupChildId),
    validateRequest({ body: CorrectCheckupInputSchema }),
    async (req, res) => {
      const { checkup, created } = await correctCheckup(
        req.auth!,
        req.link!,
        req.params.checkupId as string,
        req.body as CorrectCheckupInput,
      );
      res.status(created ? 201 : 200).json(checkup);
    },
  );

  /**
   * GET /checkups/:checkupId/results
   * The 4 WHO indicator results of a checkup. z-score, percentile, and classification are
   * only returned to linked professionals; linked caregivers receive the indicators without
   * technical data (RF-14, NK-35). Unlinked users receive 403/404.
   */
  router.get(
    '/:checkupId/results',
    requirePermission('checkup:read'),
    validateRequest({ params: CheckupParamsSchema }),
    loadCheckupChild,
    requireLink(checkupChildId),
    async (req, res) => {
      const results = await getCheckupResults(req.auth!, req.link!, req.params.checkupId as string);
      res.status(200).json(results);
    },
  );

  return router;
}
