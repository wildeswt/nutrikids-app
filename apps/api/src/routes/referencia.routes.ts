/**
 * Router de referencia OMS.
 *
 * GET /referencia/curvas?indicador=&sexo=[&posicion=]
 *   Devuelve las 5 series de z-scores (−3, −2, 0, +2, +3) calculadas
 *   con la relación inversa `medidaDesdeZ`, listas para graficar (RF-10).
 *
 *   La respuesta lleva Cache-Control público de 24 h y el campo `version`
 *   para cumplir con RT-08 (cacheable y versionada).
 */

import { CurvasQuerySchema, type CurvasQuery } from '@nutrikids/shared';
import { Router } from 'express';
import { validateRequest } from '../middlewares/validate.js';
import { calcularCurvas } from '../services/referencia.service.js';

export const referenciaRouter: Router = Router();

referenciaRouter.get('/curvas', validateRequest({ query: CurvasQuerySchema }), (req, res) => {
  const query = req.query as unknown as CurvasQuery;
  const payload = calcularCurvas(query);

  // RT-08: respuesta cacheable (tablas OMS 2006 son inmutables)
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
  res.setHeader('Vary', 'Accept-Encoding');

  res.status(200).json(payload);
});
