import { createApp } from './app.js';
import { env } from './config/env.js';
import { startErasureJob, stopErasureJob } from './jobs/erasure.js';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/overdue-alerts.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 NutriKids API running at http://localhost:${env.PORT} (${env.NODE_ENV})`);
  startBackgroundJobs();
  startErasureJob();
});

const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Closing HTTP server...`);
  stopBackgroundJobs();
  stopErasureJob();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
