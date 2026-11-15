import { AuthResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { generateTotp } from '../lib/totp.js';
import { setPasswordResetNotifier } from '../services/auth.service.js';
import { verifyAccessToken } from '../services/token.service.js';
import {
  EMPTY_TWO_FACTOR,
  mockTwoFactorStore,
  snapshot,
  type TwoFactorFields,
} from './helpers/twoFactorStore.js';

interface MemUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status: string;
}

interface MemCaregiver {
  userId: string;
  phone: string | null;
}

interface MemProfessional extends TwoFactorFields {
  userId: string;
  specialty: string;
  licenseNumber: string;
}

interface MemRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

describe('Flujo E2E de autenticación (register -> login -> refresh -> logout -> reset)', () => {
  let users: MemUser[] = [];
  let caregivers: MemCaregiver[] = [];
  let professionals: MemProfessional[] = [];
  let refreshTokens: MemRefreshToken[] = [];
  let resetTokensOutbox: { email: string; token: string }[] = [];

  beforeEach(() => {
    users = [];
    caregivers = [];
    professionals = [];
    refreshTokens = [];
    resetTokensOutbox = [];

    setPasswordResetNotifier((email, token) => {
      resetTokensOutbox.push({ email, token });
    });

    const userFindUnique = vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
      const u = where.id
        ? users.find((item) => item.id === where.id)
        : users.find((item) => item.email === where.email);
      if (!u) return null;
      return {
        ...u,
        caregiver: caregivers.find((c) => c.userId === u.id) ?? null,
        professional: snapshot(professionals.find((p) => p.userId === u.id) ?? null),
      };
    });

    const userCreate = vi.fn(async ({ data }: { data: Omit<MemUser, 'id' | 'status'> }) => {
      const created: MemUser = {
        id: `00000000-0000-4000-8000-${String(users.length + 1).padStart(12, '0')}`,
        status: 'active',
        ...data,
      };
      users.push(created);
      return created;
    });

    const userUpdateMany = vi.fn(
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

    const caregiverCreate = vi.fn(async ({ data }: { data: MemCaregiver }) => {
      caregivers.push(data);
      return data;
    });

    const professionalFindUnique = vi.fn(
      async ({ where }: { where: { licenseNumber: string } }) => {
        return professionals.find((p) => p.licenseNumber === where.licenseNumber) ?? null;
      },
    );

    const professionalCreate = vi.fn(
      async ({ data }: { data: Omit<MemProfessional, keyof TwoFactorFields> }) => {
        const created: MemProfessional = { ...EMPTY_TWO_FACTOR, ...data };
        professionals.push(created);
        return created;
      },
    );

    const refreshFindUnique = vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const rt = refreshTokens.find((item) => item.tokenHash === where.tokenHash);
      if (!rt) return null;
      const u = users.find((item) => item.id === rt.userId);
      if (!u) return null;
      return {
        ...rt,
        user: {
          ...u,
          caregiver: caregivers.find((c) => c.userId === u.id) ?? null,
          professional: professionals.find((p) => p.userId === u.id) ?? null,
        },
      };
    });

    const refreshCreate = vi.fn(
      async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        const created: MemRefreshToken = {
          id: `00000000-0000-4000-9000-${String(refreshTokens.length + 1).padStart(12, '0')}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
        };
        refreshTokens.push(created);
        return created;
      },
    );

    const refreshUpdateMany = vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: string; userId?: string; tokenHash?: string; revokedAt?: null };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const rt of refreshTokens) {
          if (where.id && rt.id !== where.id) continue;
          if (where.userId && rt.userId !== where.userId) continue;
          if (where.tokenHash && rt.tokenHash !== where.tokenHash) continue;
          if ('revokedAt' in where && rt.revokedAt !== where.revokedAt) continue;
          rt.revokedAt = data.revokedAt;
          count += 1;
        }
        return { count };
      },
    );

    vi.spyOn(prisma.user, 'findUnique').mockImplementation(userFindUnique as never);
    mockTwoFactorStore(() => professionals);
    vi.spyOn(prisma.refreshToken, 'findUnique').mockImplementation(refreshFindUnique as never);
    vi.spyOn(prisma.refreshToken, 'create').mockImplementation(refreshCreate as never);
    vi.spyOn(prisma.refreshToken, 'updateMany').mockImplementation(refreshUpdateMany as never);

    vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: unknown) => {
      return (
        fn as (tx: {
          user: {
            findUnique: typeof userFindUnique;
            create: typeof userCreate;
            updateMany: typeof userUpdateMany;
          };
          caregiver: { create: typeof caregiverCreate };
          professional: {
            findUnique: typeof professionalFindUnique;
            create: typeof professionalCreate;
          };
          refreshToken: {
            create: typeof refreshCreate;
            updateMany: typeof refreshUpdateMany;
          };
        }) => Promise<unknown>
      )({
        user: {
          findUnique: userFindUnique,
          create: userCreate,
          updateMany: userUpdateMany,
        },
        caregiver: { create: caregiverCreate },
        professional: {
          findUnique: professionalFindUnique,
          create: professionalCreate,
        },
        refreshToken: {
          create: refreshCreate,
          updateMany: refreshUpdateMany,
        },
      });
    }) as never);
  });

  it('completa el ciclo completo con segundo factor sin exponer contraseñas en claro', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 14, 12, 0, 0));
    const app = createApp();
    const firstPassword = 'ClaveInicial#2026';
    const secondPassword = 'ClaveRotada#2026';
    const logSpy = vi.spyOn(console, 'log');
    const errorSpy = vi.spyOn(console, 'error');

    // 1. Registro de profesional + cuidador
    const regRes = await request(app)
      .post('/auth/register')
      .send({
        email: '  Doctora.Elena@Hospital.EC ',
        password: firstPassword,
        firstName: 'Elena',
        lastName: 'Vega',
        roles: ['CAREGIVER', 'PROFESSIONAL'],
        specialty: 'pediatrics',
        licenseNumber: 'MSP-2026-01',
        invitationCode: 'NK-PROF-2026',
      });
    expect(regRes.status).toBe(201);
    const regBody = AuthResponseSchema.parse(regRes.body);
    // El registro profesional no entrega tokens: falta activar el segundo factor (NK-10).
    expect(regBody.requiresTwoFactor).toBe(true);
    expect(refreshTokens).toHaveLength(0);

    // 2. Primer inicio de sesión: la contraseña es correcta, pero se pide activar el QR
    const setupRes = await request(app)
      .post('/auth/login')
      .send({ email: 'doctora.elena@hospital.ec', password: firstPassword });
    expect(setupRes.status).toBe(200);
    const setupBody = AuthResponseSchema.parse(setupRes.body);
    if (!setupBody.requiresTwoFactor || !setupBody.setup) throw new Error('Se esperaba el QR');
    expect(refreshTokens).toHaveLength(0);
    const { secret } = setupBody.setup;

    // 3. Activación con el código de la aplicación autenticadora
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: 'doctora.elena@hospital.ec',
        password: firstPassword,
        totpCode: generateTotp(secret),
      });
    expect(loginRes.status).toBe(200);
    const loginBody = AuthResponseSchema.parse(loginRes.body);
    expect(loginBody.requiresTwoFactor).toBe(false);
    if (loginBody.requiresTwoFactor) return;
    const recoveryCodes = loginBody.recoveryCodes!;
    expect(recoveryCodes).toHaveLength(10);

    // 3. Renovación rotativa
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    expect(refreshRes.status).toBe(200);
    const refreshBody = AuthResponseSchema.parse(refreshRes.body);
    expect(refreshBody.requiresTwoFactor).toBe(false);
    if (refreshBody.requiresTwoFactor) return;
    expect(refreshBody.refreshToken).not.toBe(loginBody.refreshToken);

    const claims = await verifyAccessToken(refreshBody.accessToken);
    expect(claims.roles).toEqual(['CAREGIVER', 'PROFESSIONAL']);
    expect(claims.specialty).toBe('pediatrics');

    // 4. Cierre de sesión e intento de refresh posterior (debe fallar con 401)
    const logoutRes = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: refreshBody.refreshToken });
    expect(logoutRes.status).toBe(204);

    const afterLogoutRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refreshBody.refreshToken });
    expect(afterLogoutRes.status).toBe(401);

    // 5. Recuperación de contraseña y login con la nueva clave
    const forgotRes = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'doctora.elena@hospital.ec' });
    expect(forgotRes.status).toBe(202);
    expect(resetTokensOutbox).toHaveLength(1);

    const resetRes = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetTokensOutbox[0]!.token, newPassword: secondPassword });
    expect(resetRes.status).toBe(204);

    const oldLoginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'doctora.elena@hospital.ec', password: firstPassword });
    expect(oldLoginRes.status).toBe(401);

    // Con la nueva clave se sigue pidiendo el segundo factor (ya activo: sin QR)
    const newLoginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'doctora.elena@hospital.ec', password: secondPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body).toEqual({ requiresTwoFactor: true });

    // 6. Sin acceso a la app autenticadora: código de recuperación (un solo uso)
    const recoveryRes = await request(app).post('/auth/login').send({
      email: 'doctora.elena@hospital.ec',
      password: secondPassword,
      recoveryCode: recoveryCodes[0],
    });
    expect(recoveryRes.status).toBe(200);
    expect(AuthResponseSchema.parse(recoveryRes.body).requiresTwoFactor).toBe(false);

    const reusedRes = await request(app).post('/auth/login').send({
      email: 'doctora.elena@hospital.ec',
      password: secondPassword,
      recoveryCode: recoveryCodes[0],
    });
    expect(reusedRes.status).toBe(401);

    // 7. Nuevo código TOTP en el siguiente paso de 30 s
    vi.setSystemTime(Date.UTC(2026, 10, 14, 12, 1, 0));
    const totpRes = await request(app)
      .post('/auth/login')
      .send({
        email: 'doctora.elena@hospital.ec',
        password: secondPassword,
        totpCode: generateTotp(secret),
      });
    expect(totpRes.status).toBe(200);
    vi.useRealTimers();

    // Ninguna de las dos contraseñas aparece jamás en claro
    expect(JSON.stringify(users)).not.toContain(firstPassword);
    expect(JSON.stringify(users)).not.toContain(secondPassword);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(firstPassword);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(secondPassword);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(firstPassword);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secondPassword);
  });
});
