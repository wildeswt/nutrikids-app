import type { Specialty, UserRole } from '@nutrikids/shared';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERMISSIONS,
  PERMISSIONS_BY_ACTOR,
  hasPermission,
  type Permission,
} from '../lib/permissions.js';
import {
  requirePermission,
  requireRole,
  requireSpecialty,
  requireVinculo,
} from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { errorHandler } from '../middlewares/errorHandler.js';
import { signAccessToken } from '../services/token.service.js';

const db = vi.hoisted(() => ({
  caregiverLinks: [] as { caregiverId: string; childId: string }[],
  professionalLinks: [] as {
    professionalId: string;
    childId: string;
    startDate: Date;
    endDate: Date | null;
  }[],
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {},
  withUser: async (_userId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      caregiverChild: {
        findUnique: async ({
          where,
        }: {
          where: { caregiverId_childId: { caregiverId: string; childId: string } };
        }) => {
          const k = where.caregiverId_childId;
          return (
            db.caregiverLinks.find(
              (l) => l.caregiverId === k.caregiverId && l.childId === k.childId,
            ) ?? null
          );
        },
      },
      professionalChild: {
        // Aplica el mismo filtro de vigencia que la consulta real:
        // startDate <= hoy y (endDate nula o >= hoy).
        findFirst: async ({
          where,
        }: {
          where: { childId: string; professionalId: string; startDate: { lte: Date } };
        }) =>
          db.professionalLinks.find(
            (l) =>
              l.childId === where.childId &&
              l.professionalId === where.professionalId &&
              l.startDate <= where.startDate.lte &&
              (l.endDate === null || l.endDate >= where.startDate.lte),
          ) ?? null,
      },
    }),
}));

const CUIDADOR_A = '00000000-0000-4000-8000-0000000000a1';
const CUIDADOR_B = '00000000-0000-4000-8000-0000000000b1';
const PROF_NUTRI = '00000000-0000-4000-8000-0000000000c1';
const PROF_ENF = '00000000-0000-4000-8000-0000000000c2';
const PROF_PEDI = '00000000-0000-4000-8000-0000000000c3';
const MIXTO = '00000000-0000-4000-8000-0000000000d1';
const NINO_A = '11111111-1111-4111-8111-111111111111';
const NINO_B = '22222222-2222-4222-8222-222222222222';
const NINO_INEXISTENTE = '33333333-3333-4333-8333-333333333333';

async function tokenFor(
  sub: string,
  roles: UserRole[],
  specialty: Specialty | null = null,
): Promise<string> {
  const { accessToken } = await signAccessToken({ sub, roles, specialty });
  return `Bearer ${accessToken}`;
}

function daysFromToday(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/children/:childId', authenticate, requireVinculo(), (req, res) => {
    res.json({ ok: true, vinculo: req.vinculo });
  });
  app.get(
    '/q/:id',
    authenticate,
    requireVinculo((req) => req.params['id']),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.get('/only-professional', authenticate, requireRole('PROFESSIONAL'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get(
    '/only-nutrition',
    authenticate,
    requireSpecialty('nutrition', 'pediatrics'),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.post(
    '/children/:childId/follow-ups',
    authenticate,
    requireRole('PROFESSIONAL'),
    requirePermission('followup:create'),
    requireVinculo(),
    (_req, res) => {
      res.status(201).json({ ok: true });
    },
  );
  app.use(errorHandler);
  return app;
}

describe('middlewares de rol y vínculo (RT-05)', () => {
  const app = createTestApp();

  beforeEach(() => {
    db.caregiverLinks = [
      { caregiverId: CUIDADOR_A, childId: NINO_A },
      { caregiverId: CUIDADOR_B, childId: NINO_B },
      { caregiverId: MIXTO, childId: NINO_B },
    ];
    db.professionalLinks = [
      { professionalId: PROF_NUTRI, childId: NINO_A, startDate: daysFromToday(-30), endDate: null },
      {
        professionalId: PROF_ENF,
        childId: NINO_A,
        startDate: daysFromToday(-30),
        endDate: daysFromToday(-1),
      },
      { professionalId: PROF_PEDI, childId: NINO_A, startDate: daysFromToday(1), endDate: null },
      {
        professionalId: MIXTO,
        childId: NINO_A,
        startDate: daysFromToday(-5),
        endDate: daysFromToday(0),
      },
    ];
  });

  describe('autenticación', () => {
    it('responde 401 sin token', async () => {
      const res = await request(app).get(`/children/${NINO_A}`);
      expect(res.status).toBe(401);
    });

    it('responde 401 con token inválido', async () => {
      const res = await request(app)
        .get(`/children/${NINO_A}`)
        .set('Authorization', 'Bearer basura');
      expect(res.status).toBe(401);
    });
  });

  describe('requireRole / requireSpecialty / requirePermission', () => {
    it('un cuidador recibe 403 en una ruta de profesional', async () => {
      const res = await request(app)
        .get('/only-professional')
        .set('Authorization', await tokenFor(CUIDADOR_A, ['CAREGIVER']));
      expect(res.status).toBe(403);
    });

    it('un profesional pasa requireRole("PROFESSIONAL")', async () => {
      const res = await request(app)
        .get('/only-professional')
        .set('Authorization', await tokenFor(PROF_ENF, ['PROFESSIONAL'], 'nursing'));
      expect(res.status).toBe(200);
    });

    it('distingue especialidades: enfermería 403; nutrición y pediatría 200', async () => {
      const enf = await request(app)
        .get('/only-nutrition')
        .set('Authorization', await tokenFor(PROF_ENF, ['PROFESSIONAL'], 'nursing'));
      const nutri = await request(app)
        .get('/only-nutrition')
        .set('Authorization', await tokenFor(PROF_NUTRI, ['PROFESSIONAL'], 'nutrition'));
      const pedi = await request(app)
        .get('/only-nutrition')
        .set('Authorization', await tokenFor(PROF_PEDI, ['PROFESSIONAL'], 'pediatrics'));
      expect([enf.status, nutri.status, pedi.status]).toEqual([403, 200, 200]);
    });

    it('crear seguimiento: enfermería 403 por permiso aunque tenga vínculo; nutrición 201', async () => {
      db.professionalLinks.push({
        professionalId: PROF_ENF,
        childId: NINO_A,
        startDate: daysFromToday(-1),
        endDate: null,
      });
      const enf = await request(app)
        .post(`/children/${NINO_A}/follow-ups`)
        .set('Authorization', await tokenFor(PROF_ENF, ['PROFESSIONAL'], 'nursing'));
      const nutri = await request(app)
        .post(`/children/${NINO_A}/follow-ups`)
        .set('Authorization', await tokenFor(PROF_NUTRI, ['PROFESSIONAL'], 'nutrition'));
      expect(enf.status).toBe(403);
      expect(nutri.status).toBe(201);
    });
  });

  describe('requireVinculo — cuidador', () => {
    it('el cuidador A lee a su propio niño', async () => {
      const res = await request(app)
        .get(`/children/${NINO_A}`)
        .set('Authorization', await tokenFor(CUIDADOR_A, ['CAREGIVER']));
      expect(res.status).toBe(200);
      expect(res.body.vinculo).toBe('CAREGIVER');
    });

    it('el cuidador B NO puede leer al niño del cuidador A (403)', async () => {
      const res = await request(app)
        .get(`/children/${NINO_A}`)
        .set('Authorization', await tokenFor(CUIDADOR_B, ['CAREGIVER']));
      expect(res.status).toBe(403);
    });

    it('un niño inexistente responde 403, igual que uno ajeno', async () => {
      const res = await request(app)
        .get(`/children/${NINO_INEXISTENTE}`)
        .set('Authorization', await tokenFor(CUIDADOR_A, ['CAREGIVER']));
      expect(res.status).toBe(403);
    });

    it('un identificador que no es UUID responde 400', async () => {
      const res = await request(app)
        .get('/children/no-es-uuid')
        .set('Authorization', await tokenFor(CUIDADOR_A, ['CAREGIVER']));
      expect(res.status).toBe(400);
    });

    it('acepta un extractor de id personalizado', async () => {
      const res = await request(app)
        .get(`/q/${NINO_A}`)
        .set('Authorization', await tokenFor(CUIDADOR_A, ['CAREGIVER']));
      expect(res.status).toBe(200);
    });
  });

  describe('requireVinculo — profesional', () => {
    it('con vínculo vigente (sin fecha de fin) accede', async () => {
      const res = await request(app)
        .get(`/children/${NINO_A}`)
        .set('Authorization', await tokenFor(PROF_NUTRI, ['PROFESSIONAL'], 'nutrition'));
      expect(res.status).toBe(200);
      expect(res.body.vinculo).toBe('PROFESSIONAL');
    });

    it('sin vínculo con ese niño recibe 403', async () => {
      const res = await request(app)
        .get(`/children/${NINO_B}`)
        .set('Authorization', await tokenFor(PROF_NUTRI, ['PROFESSIONAL'], 'nutrition'));
      expect(res.status).toBe(403);
    });

    it('con vínculo terminado (endDate pasada) recibe 403', async () => {
      const res = await request(app)
        .get(`/children/${NINO_A}`)
        .set('Authorization', await tokenFor(PROF_ENF, ['PROFESSIONAL'], 'nursing'));
      expect(res.status).toBe(403);
    });

    it('con vínculo que aún no comienza (startDate futura) recibe 403', async () => {
      const res = await request(app)
        .get(`/children/${NINO_A}`)
        .set('Authorization', await tokenFor(PROF_PEDI, ['PROFESSIONAL'], 'pediatrics'));
      expect(res.status).toBe(403);
    });
  });

  describe('requireVinculo — usuario con ambos roles', () => {
    it('accede al niño que cuida y al que atiende, pero no a uno ajeno', async () => {
      const token = await tokenFor(MIXTO, ['CAREGIVER', 'PROFESSIONAL'], 'pediatrics');
      const cuida = await request(app).get(`/children/${NINO_B}`).set('Authorization', token);
      const atiende = await request(app).get(`/children/${NINO_A}`).set('Authorization', token);
      const ajeno = await request(app)
        .get(`/children/${NINO_INEXISTENTE}`)
        .set('Authorization', token);
      expect([cuida.status, atiende.status, ajeno.status]).toEqual([200, 200, 403]);
      expect(cuida.body.vinculo).toBe('CAREGIVER');
      expect(atiende.body.vinculo).toBe('PROFESSIONAL');
    });
  });
});

describe('matriz de permisos', () => {
  const caregiver = { userId: 'x', roles: ['CAREGIVER'] as UserRole[], specialty: null };
  const prof = (specialty: Specialty) => ({
    userId: 'x',
    roles: ['PROFESSIONAL'] as UserRole[],
    specialty,
  });

  it('todos los permisos de la matriz existen en PERMISSIONS', () => {
    for (const list of Object.values(PERMISSIONS_BY_ACTOR)) {
      for (const p of list) expect(PERMISSIONS).toContain(p);
    }
  });

  it.each<[Permission, boolean, boolean, boolean, boolean]>([
    // permiso, cuidador, enfermería, nutrición, pediatría
    ['child:read', true, true, true, true],
    ['checkup:create', true, true, true, true],
    ['alert:review', false, true, true, true],
    ['followup:create', false, false, true, true],
  ])('%s', (perm, c, e, n, p) => {
    expect(hasPermission(caregiver, perm)).toBe(c);
    expect(hasPermission(prof('nursing'), perm)).toBe(e);
    expect(hasPermission(prof('nutrition'), perm)).toBe(n);
    expect(hasPermission(prof('pediatrics'), perm)).toBe(p);
  });

  it('un profesional sin especialidad no obtiene permisos profesionales', () => {
    expect(
      hasPermission({ userId: 'x', roles: ['PROFESSIONAL'], specialty: null }, 'alert:review'),
    ).toBe(false);
  });
});
