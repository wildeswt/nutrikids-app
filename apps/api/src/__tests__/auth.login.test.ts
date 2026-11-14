import { AuthResponseSchema, ErrorResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { encryptUserNames } from '../services/pii.service.js';
import { hashRefreshToken, verifyAccessToken } from '../services/token.service.js';

interface MockUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstNameEnc: string;
  lastNameEnc: string;
  status: string;
  caregiver: { userId: string } | null;
  professional: { userId: string; specialty: string } | null;
}

describe('POST /auth/login y límite de intentos', () => {
  const plainPassword = 'ClaveLogin#2026';
  let passwordHash = '';
  let users: MockUserRecord[] = [];
  let refreshTokens: { userId: string; tokenHash: string; expiresAt: Date }[] = [];

  beforeAll(async () => {
    passwordHash = await hashPassword(plainPassword);
  });

  beforeEach(() => {
    refreshTokens = [];
    users = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        email: 'ana@correo.ec',
        passwordHash,
        ...encryptUserNames({ firstName: 'Ana', lastName: 'Pérez' }),
        status: 'active',
        caregiver: { userId: '00000000-0000-4000-8000-000000000010' },
        professional: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000020',
        email: 'elena@hospital.ec',
        passwordHash,
        ...encryptUserNames({ firstName: 'Elena', lastName: 'Vega' }),
        status: 'active',
        caregiver: { userId: '00000000-0000-4000-8000-000000000020' },
        professional: {
          userId: '00000000-0000-4000-8000-000000000020',
          specialty: 'pediatrics',
        },
      },
      {
        id: '00000000-0000-4000-8000-000000000030',
        email: 'suspendido@correo.ec',
        passwordHash,
        ...encryptUserNames({ firstName: 'Mario', lastName: 'Ríos' }),
        status: 'suspended',
        caregiver: { userId: '00000000-0000-4000-8000-000000000030' },
        professional: null,
      },
    ];

    vi.spyOn(prisma.user, 'findUnique').mockImplementation((async ({
      where,
    }: {
      where: { email: string };
    }) => {
      return users.find((u) => u.email === where.email) ?? null;
    }) as never);

    vi.spyOn(prisma.refreshToken, 'create').mockImplementation((async ({
      data,
    }: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }) => {
      refreshTokens.push(data);
      return data;
    }) as never);
  });

  it('inicia sesión como cuidador o cuenta mixta devolviendo roles, especialidad y tokens', async () => {
    const app = createApp();
    const logSpy = vi.spyOn(console, 'log');
    const errorSpy = vi.spyOn(console, 'error');

    const caregiverRes = await request(app)
      .post('/auth/login')
      .send({ email: '  ANA@Correo.EC ', password: plainPassword });

    expect(caregiverRes.status).toBe(200);
    const parsedCaregiver = AuthResponseSchema.parse(caregiverRes.body);
    expect(parsedCaregiver.requiresTwoFactor).toBe(false);
    if (parsedCaregiver.requiresTwoFactor) return;

    expect(parsedCaregiver.user).toEqual({
      id: '00000000-0000-4000-8000-000000000010',
      email: 'ana@correo.ec',
      firstName: 'Ana',
      lastName: 'Pérez',
      roles: ['CAREGIVER'],
      specialty: null,
    });
    expect(refreshTokens[0]?.tokenHash).toBe(hashRefreshToken(parsedCaregiver.refreshToken));
    expect(JSON.stringify(caregiverRes.body)).not.toContain(plainPassword);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(plainPassword);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(plainPassword);

    const dualRes = await request(app)
      .post('/auth/login')
      .send({ email: 'elena@hospital.ec', password: plainPassword });

    expect(dualRes.status).toBe(200);
    const parsedDual = AuthResponseSchema.parse(dualRes.body);
    expect(parsedDual.requiresTwoFactor).toBe(false);
    if (parsedDual.requiresTwoFactor) return;

    expect(parsedDual.user.roles).toEqual(['CAREGIVER', 'PROFESSIONAL']);
    expect(parsedDual.user.specialty).toBe('pediatrics');

    const claims = await verifyAccessToken(parsedDual.accessToken);
    expect(claims).toEqual({
      sub: '00000000-0000-4000-8000-000000000020',
      roles: ['CAREGIVER', 'PROFESSIONAL'],
      specialty: 'pediatrics',
    });
  });

  it('responde 401 con el mismo mensaje para contraseña incorrecta y correo inexistente', async () => {
    const app = createApp();

    const wrongPasswordRes = await request(app)
      .post('/auth/login')
      .send({ email: 'ana@correo.ec', password: 'ClaveIncorrecta123' });

    expect(wrongPasswordRes.status).toBe(401);
    expect(ErrorResponseSchema.safeParse(wrongPasswordRes.body).success).toBe(true);
    expect(wrongPasswordRes.body).toEqual({
      error: 'Request Error',
      message: 'Credenciales inválidas',
    });

    const unknownEmailRes = await request(app)
      .post('/auth/login')
      .send({ email: 'noexiste@correo.ec', password: 'ClaveIncorrecta123' });

    expect(unknownEmailRes.status).toBe(401);
    expect(unknownEmailRes.body).toEqual(wrongPasswordRes.body);
    expect(refreshTokens).toHaveLength(0);
  });

  it('rechaza con 403 cuando la cuenta está suspendida', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'suspendido@correo.ec', password: plainPassword });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('La cuenta está suspendida');
    expect(refreshTokens).toHaveLength(0);
  });

  it('bloquea con 429 tras 5 intentos fallidos y no descuenta intentos exitosos', async () => {
    const app = createApp();

    // 3 inicios de sesión exitosos no deben consumir el límite
    for (let i = 0; i < 3; i += 1) {
      const okRes = await request(app)
        .post('/auth/login')
        .send({ email: 'ana@correo.ec', password: plainPassword });
      expect(okRes.status).toBe(200);
    }

    // 5 intentos fallidos devuelven 401
    for (let i = 0; i < 5; i += 1) {
      const failRes = await request(app)
        .post('/auth/login')
        .send({ email: 'ana@correo.ec', password: `Fallo-${i}` });
      expect(failRes.status).toBe(401);
    }

    // El 6to intento fallido devuelve 429 Too Many Requests
    const blockedRes = await request(app)
      .post('/auth/login')
      .send({ email: 'ana@correo.ec', password: plainPassword });

    expect(blockedRes.status).toBe(429);
    expect(ErrorResponseSchema.safeParse(blockedRes.body).success).toBe(true);
    expect(blockedRes.body.error).toBe('Too Many Requests');
  });
});
