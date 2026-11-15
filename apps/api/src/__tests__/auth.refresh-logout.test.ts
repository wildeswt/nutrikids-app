import { AuthResponseSchema, ErrorResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { generateRefreshToken, verifyAccessToken } from '../services/token.service.js';

interface MockUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  caregiver: { userId: string } | null;
  professional: { userId: string; specialty: string; totpEnabledAt: Date | null } | null;
}

interface MockRefreshRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

describe('POST /auth/refresh (rotación) y POST /auth/logout', () => {
  const app = createApp();
  let users: MockUser[] = [];
  let refreshRows: MockRefreshRow[] = [];

  beforeEach(() => {
    users = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        email: 'elena@hospital.ec',
        firstName: 'Elena',
        lastName: 'Vega',
        status: 'active',
        caregiver: null,
        professional: {
          userId: '00000000-0000-4000-8000-000000000010',
          specialty: 'pediatrics',
          // Profesional con el segundo factor ya activado (NK-10).
          totpEnabledAt: new Date('2026-11-01T00:00:00Z'),
        },
      },
    ];
    refreshRows = [];

    const findUniqueImpl = vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const row = refreshRows.find((r) => r.tokenHash === where.tokenHash);
      if (!row) return null;
      const user = users.find((u) => u.id === row.userId);
      if (!user) return null;
      return { ...row, user };
    });

    const updateManyImpl = vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: string; userId?: string; tokenHash?: string; revokedAt?: null };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const row of refreshRows) {
          if (where.id && row.id !== where.id) continue;
          if (where.userId && row.userId !== where.userId) continue;
          if (where.tokenHash && row.tokenHash !== where.tokenHash) continue;
          if ('revokedAt' in where && row.revokedAt !== where.revokedAt) continue;
          row.revokedAt = data.revokedAt;
          count += 1;
        }
        return { count };
      },
    );

    const createImpl = vi.fn(
      async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        const created: MockRefreshRow = {
          id: `00000000-0000-4000-8000-${String(refreshRows.length + 1).padStart(12, '0')}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
        };
        refreshRows.push(created);
        return created;
      },
    );

    vi.spyOn(prisma.refreshToken, 'findUnique').mockImplementation(findUniqueImpl as never);
    vi.spyOn(prisma.refreshToken, 'updateMany').mockImplementation(updateManyImpl as never);
    vi.spyOn(prisma.refreshToken, 'create').mockImplementation(createImpl as never);

    vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: unknown) => {
      return (
        fn as (tx: {
          refreshToken: {
            updateMany: typeof updateManyImpl;
            create: typeof createImpl;
          };
        }) => Promise<unknown>
      )({
        refreshToken: {
          updateMany: updateManyImpl,
          create: createImpl,
        },
      });
    }) as never);
  });

  function seedRefreshToken(overrides?: Partial<MockRefreshRow>): string {
    const generated = generateRefreshToken();
    refreshRows.push({
      id: `00000000-0000-4000-8000-${String(refreshRows.length + 1).padStart(12, '0')}`,
      userId: '00000000-0000-4000-8000-000000000010',
      tokenHash: generated.tokenHash,
      expiresAt: generated.expiresAt,
      revokedAt: null,
      ...overrides,
    });
    return generated.refreshToken;
  }

  it('rota el refresh token entregando uno nuevo, revoca el anterior y renueva el access token', async () => {
    const initialToken = seedRefreshToken();

    const res = await request(app).post('/auth/refresh').send({ refreshToken: initialToken });

    expect(res.status).toBe(200);
    const parsed = AuthResponseSchema.parse(res.body);
    expect(parsed.requiresTwoFactor).toBe(false);
    if (parsed.requiresTwoFactor) return;

    expect(parsed.refreshToken).not.toBe(initialToken);
    expect(refreshRows).toHaveLength(2);
    expect(refreshRows[0]?.revokedAt).toBeInstanceOf(Date);
    expect(refreshRows[1]?.revokedAt).toBeNull();

    const claims = await verifyAccessToken(parsed.accessToken);
    expect(claims).toEqual({
      sub: '00000000-0000-4000-8000-000000000010',
      roles: ['PROFESSIONAL'],
      specialty: 'pediatrics',
    });
  });

  it('detecta reutilización de un refresh token ya rotado y revoca todas las sesiones del usuario', async () => {
    const firstToken = seedRefreshToken();

    const rotatedRes = await request(app).post('/auth/refresh').send({ refreshToken: firstToken });
    expect(rotatedRes.status).toBe(200);
    const secondToken = rotatedRes.body.refreshToken as string;

    // Reutilizar el primer token (ya revocado) debe revocar también el segundo
    const reuseRes = await request(app).post('/auth/refresh').send({ refreshToken: firstToken });
    expect(reuseRes.status).toBe(401);
    expect(ErrorResponseSchema.safeParse(reuseRes.body).success).toBe(true);
    expect(reuseRes.body.message).toBe(
      'Token de renovación reutilizado; se revocaron las sesiones activas',
    );

    // Ahora el segundo token tampoco puede usarse porque toda la familia quedó revocada
    expect(refreshRows.every((r) => r.revokedAt !== null)).toBe(true);
    const secondAttempt = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: secondToken });
    expect(secondAttempt.status).toBe(401);
  });

  it('rechaza con 401 tokens inexistentes o expirados y con 403 cuentas suspendidas', async () => {
    const unknownRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'token-inexistente' });
    expect(unknownRes.status).toBe(401);
    expect(unknownRes.body.message).toBe('Token de renovación inválido');

    const expiredToken = seedRefreshToken({ expiresAt: new Date(Date.now() - 60_000) });
    const expiredRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: expiredToken });
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.message).toBe('Token de renovación expirado');

    const activeToken = seedRefreshToken();
    users[0]!.status = 'suspended';
    const suspendedRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: activeToken });
    expect(suspendedRes.status).toBe(403);
    expect(suspendedRes.body.message).toBe('La cuenta está suspendida');
  });

  it('POST /auth/logout revoca el token de forma idempotente (204) e impide renovarlo después', async () => {
    const token = seedRefreshToken();

    const firstLogout = await request(app).post('/auth/logout').send({ refreshToken: token });
    expect(firstLogout.status).toBe(204);
    expect(refreshRows[0]?.revokedAt).toBeInstanceOf(Date);

    // Repetir el cierre de sesión con el mismo token es idempotente
    const secondLogout = await request(app).post('/auth/logout').send({ refreshToken: token });
    expect(secondLogout.status).toBe(204);

    // Intentar usar el token revocado tras logout devuelve 401
    const refreshAfterLogout = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: token });
    expect(refreshAfterLogout.status).toBe(401);
  });
});
