import type { Specialty, UserRole } from '@nutrikids/shared';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middlewares/errorHandler.js';
import { auditHealth } from '../middlewares/auditHealth.js';
import { createAuditRouter } from '../routes/audit.routes.js';
import { listAuditLogs, logAuditEvent } from '../services/audit.service.js';
import { signAccessToken } from '../services/token.service.js';

// Base de datos en memoria para los mocks de Prisma en auditoría
const mockAuditLogs: Array<{
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAt: Date;
}> = [];

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(async ({ data }) => {
        const row = {
          id: '00000000-0000-4000-8000-000000000099',
          userId: data.userId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId ?? null,
          occurredAt: new Date(),
        };
        mockAuditLogs.push(row);
        return row;
      }),
      findMany: vi.fn(async () => mockAuditLogs),
      count: vi.fn(async () => mockAuditLogs.length),
    },
  },
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => fn({})),
}));

const PROF_USER_ID = '00000000-0000-4000-8000-000000000001';
const CAREGIVER_USER_ID = '00000000-0000-4000-8000-000000000002';
const CHILD_ID = '00000000-0000-4000-8000-000000000003';
const CHECKUP_ID = '00000000-0000-4000-8000-000000000004';

async function createToken(
  userId: string,
  roles: UserRole[],
  specialty: Specialty | null = null,
): Promise<string> {
  const { accessToken } = await signAccessToken({ sub: userId, roles, specialty });
  return `Bearer ${accessToken}`;
}

describe('Auditoría de accesos y modificaciones (NK-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogs.length = 0;
  });

  describe('audit.service', () => {
    it('logAuditEvent inserta un registro con usuario, acción, entidad, id y fecha', async () => {
      const { prisma } = await import('../lib/prisma.js');

      await logAuditEvent({
        userId: PROF_USER_ID,
        action: 'CREATE',
        entityType: 'checkups',
        entityId: CHECKUP_ID,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: PROF_USER_ID,
          action: 'CREATE',
          entityType: 'checkups',
          entityId: CHECKUP_ID,
        },
      });
      expect(mockAuditLogs).toHaveLength(1);
      expect(mockAuditLogs[0]!.action).toBe('CREATE');
      expect(mockAuditLogs[0]!.entityType).toBe('checkups');
      expect(mockAuditLogs[0]!.entityId).toBe(CHECKUP_ID);
    });

    it('logAuditEvent permite entityId nulo para consultas agregadas', async () => {
      const { prisma } = await import('../lib/prisma.js');

      await logAuditEvent({
        userId: CAREGIVER_USER_ID,
        action: 'READ',
        entityType: 'children',
        entityId: null,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: CAREGIVER_USER_ID,
          action: 'READ',
          entityType: 'children',
          entityId: null,
        },
      });
    });

    it('listAuditLogs retorna listado estructurado y paginado', async () => {
      mockAuditLogs.push({
        id: '00000000-0000-4000-8000-000000000010',
        userId: PROF_USER_ID,
        action: 'READ',
        entityType: 'checkups',
        entityId: CHECKUP_ID,
        occurredAt: new Date('2026-11-12T12:00:00Z'),
      });

      const auth = {
        userId: PROF_USER_ID,
        roles: ['PROFESSIONAL'] as UserRole[],
        specialty: 'pediatrics' as Specialty,
      };
      const res = await listAuditLogs(auth, { page: 1, limit: 50 });

      expect(res.total).toBe(1);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(50);
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({
        id: '00000000-0000-4000-8000-000000000010',
        userId: PROF_USER_ID,
        action: 'READ',
        entityType: 'checkups',
        entityId: CHECKUP_ID,
        occurredAt: '2026-11-12T12:00:00.000Z',
      });
    });
  });

  describe('auditHealth middleware', () => {
    function createTestApp(statusCode = 200) {
      const app = express();
      app.use(express.json());

      // Mock auth middleware
      app.use((req, _res, next) => {
        const header = req.headers.authorization;
        if (header?.includes('prof')) {
          req.auth = { userId: PROF_USER_ID, roles: ['PROFESSIONAL'], specialty: 'pediatrics' };
        } else if (header?.includes('caregiver')) {
          req.auth = { userId: CAREGIVER_USER_ID, roles: ['CAREGIVER'], specialty: null };
        }
        next();
      });

      app.get(
        '/test/:childId',
        auditHealth({
          action: 'READ',
          entityType: 'children',
        }),
        (_req, res) => {
          res.status(statusCode).json({ ok: true });
        },
      );

      app.post(
        '/test/:childId/checkups',
        auditHealth({
          action: 'CREATE',
          entityType: 'checkups',
          getEntityId: (_req, res) => res.locals.auditEntityId as string | undefined,
        }),
        (_req, res) => {
          res.locals.auditEntityId = CHECKUP_ID;
          res.status(201).json({ id: CHECKUP_ID });
        },
      );

      app.use(errorHandler);
      return app;
    }

    it('registra auditoría de lectura en respuesta exitosa (200)', async () => {
      const app = createTestApp(200);
      await request(app).get(`/test/${CHILD_ID}`).set('Authorization', 'prof');

      // Dar un tick para el evento finish
      await new Promise((r) => setTimeout(r, 20));

      expect(mockAuditLogs).toHaveLength(1);
      expect(mockAuditLogs[0]).toMatchObject({
        userId: PROF_USER_ID,
        action: 'READ',
        entityType: 'children',
        entityId: CHILD_ID,
      });
    });

    it('registra auditoría de escritura en respuesta de creación (201) usando extractor dinámico', async () => {
      const app = createTestApp(201);
      await request(app)
        .post(`/test/${CHILD_ID}/checkups`)
        .set('Authorization', 'caregiver')
        .send({});

      await new Promise((r) => setTimeout(r, 20));

      expect(mockAuditLogs).toHaveLength(1);
      expect(mockAuditLogs[0]).toMatchObject({
        userId: CAREGIVER_USER_ID,
        action: 'CREATE',
        entityType: 'checkups',
        entityId: CHECKUP_ID,
      });
    });

    it('NO registra auditoría en respuestas de error (4xx / 5xx)', async () => {
      const app = createTestApp(404);
      await request(app).get(`/test/${CHILD_ID}`).set('Authorization', 'prof');

      await new Promise((r) => setTimeout(r, 20));

      expect(mockAuditLogs).toHaveLength(0);
    });

    it('NO interrumpe la respuesta HTTP si la inserción de auditoría falla', async () => {
      const { prisma } = await import('../lib/prisma.js');
      vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error('DB failure'));

      const app = createTestApp(200);
      const res = await request(app).get(`/test/${CHILD_ID}`).set('Authorization', 'prof');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('Control de acceso a la auditoría (GET /audit)', () => {
    function makeApp() {
      const app = express();
      app.use(express.json());
      app.use('/audit', createAuditRouter());
      app.use(errorHandler);
      return app;
    }

    it('responde 401 si no se envía token de autenticación', async () => {
      const res = await request(makeApp()).get('/audit');
      expect(res.status).toBe(401);
    });

    it('responde 403 para rol CAREGIVER (el cuidador no tiene permiso audit:read)', async () => {
      const token = await createToken(CAREGIVER_USER_ID, ['CAREGIVER']);
      const res = await request(makeApp()).get('/audit').set('Authorization', token);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/no tienes permiso para esta acción/i);
    });

    it('responde 200 y permite consulta a un profesional (pediatría con audit:read)', async () => {
      const token = await createToken(PROF_USER_ID, ['PROFESSIONAL'], 'pediatrics');
      const res = await request(makeApp()).get('/audit').set('Authorization', token);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(50);
    });

    it('responde 200 y permite consulta a un profesional de enfermería (audit:read)', async () => {
      const token = await createToken(PROF_USER_ID, ['PROFESSIONAL'], 'nursing');
      const res = await request(makeApp()).get('/audit').set('Authorization', token);

      expect(res.status).toBe(200);
    });

    it('responde 200 y permite consulta a un profesional de nutrición (audit:read)', async () => {
      const token = await createToken(PROF_USER_ID, ['PROFESSIONAL'], 'nutrition');
      const res = await request(makeApp()).get('/audit').set('Authorization', token);

      expect(res.status).toBe(200);
    });

    it('rechaza con 400 query parameters inválidos (page < 1)', async () => {
      const token = await createToken(PROF_USER_ID, ['PROFESSIONAL'], 'pediatrics');
      const res = await request(makeApp()).get('/audit?page=0').set('Authorization', token);

      expect(res.status).toBe(400);
    });

    it('rechaza con 400 query parameters con limit > 100', async () => {
      const token = await createToken(PROF_USER_ID, ['PROFESSIONAL'], 'pediatrics');
      const res = await request(makeApp()).get('/audit?limit=150').set('Authorization', token);

      expect(res.status).toBe(400);
    });

    it('la auditoría solo admite inserciones (no existen rutas PUT, PATCH, DELETE en /audit)', async () => {
      const token = await createToken(PROF_USER_ID, ['PROFESSIONAL'], 'pediatrics');
      const app = makeApp();

      const putRes = await request(app).put('/audit').set('Authorization', token).send({});
      expect(putRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete(`/audit/${CHECKUP_ID}`)
        .set('Authorization', token);
      expect(deleteRes.status).toBe(404);
    });
  });
});
