import { HealthResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

describe('Health & Error Endpoints', () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /health returns 200 and db: ok when PostgreSQL is reachable', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'nutrikids-api',
      db: 'ok',
    });
  });

  it('GET /health returns 503 and db: disconnected when PostgreSQL fails', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(res.body).toMatchObject({
      status: 'degraded',
      service: 'nutrikids-api',
      db: 'disconnected',
    });
  });

  it('GET /non-existent returns 404 JSON error', async () => {
    const res = await request(app).get('/non-existent');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'Not Found',
      message: 'Route GET /non-existent not found',
    });
  });
});
