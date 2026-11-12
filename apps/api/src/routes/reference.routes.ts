/**
 * WHO reference router.
 *
 * GET /reference/curves?indicator=&sex=[&position=]
 *   Returns the 5 z-score series (-3, -2, 0, +2, +3) computed
 *   with the inverse relation `measurementFromZScore`, ready for plotting (RF-10).
 *
 *   Response includes public 24h Cache-Control and `version` field
 *   to satisfy RT-08 (cacheable and versioned).
 */

import { OmsReferenceCurvesQuerySchema, type OmsReferenceCurvesQuery } from '@nutrikids/shared';
import { Router } from 'express';
import { validateRequest } from '../middlewares/validate.js';
import { calculateReferenceCurves } from '../services/reference.service.js';

export const referenceRouter: Router = Router();

referenceRouter.get(
  '/curves',
  validateRequest({ query: OmsReferenceCurvesQuerySchema }),
  (req, res) => {
    const query = req.query as unknown as OmsReferenceCurvesQuery;
    const payload = calculateReferenceCurves(query);

    // RT-08: cacheable response (WHO 2006 tables are immutable)
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    res.setHeader('Vary', 'Accept-Encoding');

    res.status(200).json(payload);
  },
);
