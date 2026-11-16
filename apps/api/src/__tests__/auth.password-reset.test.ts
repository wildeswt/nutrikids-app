import { ForgotPasswordResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { setPasswordResetNotifier } from '../services/auth.service.js';
import { signPasswordResetToken } from '../services/token.service.js';

interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
}

describe('POST /auth/forgot-password y POST /auth/reset-password', () => {
  const initialPassword = 'ClaveInicial#2026';
  let initialHash = '';
  let users: MockUser[] = [];
  let refreshTokens: { userId: string; revokedAt: Date | null }[] = [];
  let deliveredTokens: { email: string; token: string }[] = [];

  beforeAll(async () => {
    initialHash = await hashPassword(initialPassword);
  });

  beforeEach(() => {
    deliveredTokens = [];
    setPasswordResetNotifier((email, token) => {
      deliveredTokens.push({ email, token });
    });

    users = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        email: 'ana@correo.ec',
        passwordHash: initialHash,
        status: 'active',
      },
    ];
    refreshTokens = [{ userId: '00000000-0000-4000-8000-000000000010', revokedAt: null }];

    vi.spyOn(prisma.user, 'findUnique').mockImplementation((async ({
      where,
    }: {
      where: { id?: string; email?: string };
    }) => {
      if (where.id) return users.find((u) => u.id === where.id) ?? null;
      if (where.email) return users.find((u) => u.email === where.email) ?? null;
      return null;
    }) as never);

    const updateUserManyImpl = vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; passwordHash: string };
        data: { passwordHash: string };
      }) => {
        let count = 0;
        for (const u of users) {
          if (u.id === where.id && u.passwordHash === where.passwordHash) {
            u.passwordHash = data.passwordHash;
            count += 1;
          }
        }
        return { count };
      },
    );

    const updateRefreshManyImpl = vi.fn(
      async ({
        where,
        data,
      }: {
        where: { userId: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const rt of refreshTokens) {
          if (rt.userId === where.userId && rt.revokedAt === null) {
            rt.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      },
    );

    vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: unknown) => {
      return (
        fn as (tx: {
          user: { updateMany: typeof updateUserManyImpl };
          refreshToken: { updateMany: typeof updateRefreshManyImpl };
        }) => Promise<unknown>
      )({
        user: { updateMany: updateUserManyImpl },
        refreshToken: { updateMany: updateRefreshManyImpl },
      });
    }) as never);
  });

  it('forgot-password responde 202 con el mismo mensaje exista o no el correo', async () => {
    const app = createApp();

    const existingRes = await request(app)
      .post('/auth/forgot-password')
      .send({ email: '  ANA@Correo.ec ' });
    expect(existingRes.status).toBe(202);
    expect(ForgotPasswordResponseSchema.safeParse(existingRes.body).success).toBe(true);
    expect(deliveredTokens).toHaveLength(1);
    expect(deliveredTokens[0]?.email).toBe('ana@correo.ec');

    const unknownRes = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'noexiste@correo.ec' });
    expect(unknownRes.status).toBe(202);
    expect(unknownRes.body).toEqual(existingRes.body);
    expect(deliveredTokens).toHaveLength(1);
  });

  it('reset-password cambia la contraseña con Argon2id, revoca sesiones e invalida el token tras un uso', async () => {
    const app = createApp();

    await request(app).post('/auth/forgot-password').send({ email: 'ana@correo.ec' });
    const resetToken = deliveredTokens[0]!.token;
    const newPassword = 'NuevaClaveSegura#2026';

    const resetRes = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword });

    expect(resetRes.status).toBe(204);
    expect(users[0]!.passwordHash).not.toBe(initialHash);
    expect(await verifyPassword(users[0]!.passwordHash, newPassword)).toBe(true);
    expect(await verifyPassword(users[0]!.passwordHash, initialPassword)).toBe(false);
    expect(refreshTokens[0]!.revokedAt).toBeInstanceOf(Date);

    // Reutilizar el mismo token de recuperación debe fallar con 401
    const replayRes = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'OtraClaveDistinta#2026' });
    expect(replayRes.status).toBe(401);
  });

  it('rechaza con 401 tokens de recuperación expirados o manipulados', async () => {
    const app = createApp();

    const expiredToken = await signPasswordResetToken(users[0]!.id, users[0]!.passwordHash, {
      ttlSeconds: -10,
    });

    const expiredRes = await request(app)
      .post('/auth/reset-password')
      .send({ token: expiredToken, newPassword: 'NuevaClaveSegura#2026' });
    expect(expiredRes.status).toBe(401);

    const tamperedRes = await request(app)
      .post('/auth/reset-password')
      .send({ token: `${expiredToken}xyz`, newPassword: 'NuevaClaveSegura#2026' });
    expect(tamperedRes.status).toBe(401);
  });
});
