import { HealthResponseSchema, type HealthResponse } from '@nutrikids/shared';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const healthRouter: Router = Router();

healthRouter.get('/', async (_req, res) => {
  let dbStatus: 'ok' | 'disconnected' = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'ok';
  const payload: HealthResponse = HealthResponseSchema.parse({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'nutrikids-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: dbStatus,
  });

  res.status(isHealthy ? 200 : 503).json(payload);
});
