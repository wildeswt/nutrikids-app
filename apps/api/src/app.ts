import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { createAlertsRouter } from './routes/alerts.routes.js';
import { createAuditRouter } from './routes/audit.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCheckupsRouter } from './routes/checkups.routes.js';
import { createChildrenRouter } from './routes/children.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { referenceRouter } from './routes/reference.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    }),
  );
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/auth', createAuthRouter());
  app.use('/children', createChildrenRouter());
  app.use('/checkups', createCheckupsRouter());
  app.use('/reference', referenceRouter);
  app.use('/audit', createAuditRouter());
  app.use('/alerts', createAlertsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
