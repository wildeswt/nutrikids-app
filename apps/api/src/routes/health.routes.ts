import { HealthResponseSchema, type HealthResponse } from '@nutrikids/shared';
import { Router } from 'express';

export const healthRouter: Router = Router();

healthRouter.get('/', (_req, res) => {
  const payload: HealthResponse = HealthResponseSchema.parse({
    status: 'ok',
    service: 'nutrikids-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: 'not_configured',
  });

  res.status(200).json(payload);
});
