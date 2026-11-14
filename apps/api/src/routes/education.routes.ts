import { EducationQuerySchema, type EducationQuery } from '@nutrikids/shared';
import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { listEducationalContent } from '../services/education.service.js';

export function createEducationRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /**
   * GET /education?ageMonths=&language=
   * Educational articles for an age in months and a language (default `es`). Any authenticated
   * role may read it; it is not child data, so it needs no link or consent. Without `ageMonths`
   * it returns the whole catalog of the language, which the app can cache for offline reading.
   * The response carries an ETag (Express default), so a revalidation answers `304`.
   */
  router.get('/', validateRequest({ query: EducationQuerySchema }), async (req, res) => {
    const articles = await listEducationalContent(req.query as unknown as EducationQuery);
    res.status(200).json(articles);
  });

  return router;
}
