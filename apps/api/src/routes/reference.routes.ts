/**
 * Router de referencia OMS.
 *
 * GET /reference/curves?indicator=&sex=[&position=]
 *   Devuelve las 5 series de z-scores (−3, −2, 0, +2, +3) calculadas
 *   con la relación inversa `medidaDesdeZ`, listas para graficar (RF-10).
 *
 *   La respuesta lleva Cache-Control público de 24 h y el campo `version`
 *   para cumplir con RT-08 (cacheable y versionada).
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

    // RT-08: respuesta cacheable (tablas OMS 2006 son inmutables)
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    res.setHeader('Vary', 'Accept-Encoding');

    res.status(200).json(payload);
  },
);
