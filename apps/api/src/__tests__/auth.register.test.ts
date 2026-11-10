import { AuthResponseSchema, ErrorResponseSchema } from '@nutrikids/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { hashRefreshToken, verifyAccessToken } from '../services/token.service.js';

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
}

interface StoredProfessional {
  userId: string;
  specialty: string;
  licenseNumber: string;
}

interface StoredRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

describe('POST /auth/register', () => {
  const app = createApp();

  let users: StoredUser[] = [];
  let caregivers: { userId: string; phone: string | null }[] = [];
  let professionals: StoredProfessional[] = [];
  let refreshTokens: StoredRefreshToken[] = [];

  beforeEach(() => {
    users = [];
    caregivers = [];
    professionals = [];
    refreshTokens = [];

    const txMock = {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
          return users.find((u) => u.email === where.email) ?? null;
        }),
        create: vi.fn(async ({ data }: { data: Omit<StoredUser, 'id'> }) => {
          const created: StoredUser = {
            id: `00000000-0000-4000-8000-${String(users.length + 1).padStart(12, '0')}`,
            ...data,
          };
          users.push(created);
          return created;
        }),
      },
      caregiver: {
        create: vi.fn(async ({ data }: { data: { userId: string; phone: string | null } }) => {
          caregivers.push(data);
          return data;
        }),
      },
      professional: {
        findUnique: vi.fn(async ({ where }: { where: { licenseNumber: string } }) => {
          return professionals.find((p) => p.licenseNumber === where.licenseNumber) ?? null;
        }),
        create: vi.fn(async ({ data }: { data: StoredProfessional }) => {
          professionals.push(data);
          return data;
        }),
      },
      refreshToken: {
        create: vi.fn(async ({ data }: { data: StoredRefreshToken }) => {
          refreshTokens.push(data);
          return data;
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: unknown) => {
      return (fn as (tx: typeof txMock) => Promise<unknown>)(txMock);
    }) as never);
  });

  it('registra un cuidador, guarda la contraseña con hash Argon2id y devuelve tokens válidos', async () => {
    const plainPassword = 'ClaveCuidador#2026';
    const logSpy = vi.spyOn(console, 'log');
    const errorSpy = vi.spyOn(console, 'error');

    const res = await request(app)
      .post('/auth/register')
      .send({
        email: '  Maria.Cuidadora@Correo.EC ',
        password: plainPassword,
        firstName: 'María',
        lastName: 'Andrade',
        roles: ['CAREGIVER'],
        phone: '+593 99 123 4567',
      });

    expect(res.status).toBe(201);
    const parsed = AuthResponseSchema.parse(res.body);
    expect(parsed.requiresTwoFactor).toBe(false);
    if (parsed.requiresTwoFactor) return;

    expect(parsed.user).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'maria.cuidadora@correo.ec',
      firstName: 'María',
      lastName: 'Andrade',
      roles: ['CAREGIVER'],
      specialty: null,
    });

    // Verifica que la contraseña se guardó con Argon2id y nunca en claro
    expect(users[0]?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(users[0]?.passwordHash).not.toContain(plainPassword);
    expect(JSON.stringify(res.body)).not.toContain(plainPassword);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(plainPassword);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(plainPassword);

    // Verifica que el refresh token se guardó hasheado (SHA-256)
    expect(refreshTokens[0]?.tokenHash).toBe(hashRefreshToken(parsed.refreshToken));
    expect(refreshTokens[0]?.tokenHash).not.toBe(parsed.refreshToken);

    // Verifica que el access token contiene las claims esperadas
    const claims = await verifyAccessToken(parsed.accessToken);
    expect(claims).toEqual({
      sub: '00000000-0000-4000-8000-000000000001',
      roles: ['CAREGIVER'],
      specialty: null,
    });
    expect(caregivers).toHaveLength(1);
    expect(professionals).toHaveLength(0);
  });

  it('registra un profesional con código de invitación válido y ambos perfiles cuando se solicita', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: 'pediatra@hospital.ec',
        password: 'ClaveDoctora#2026',
        firstName: ' Elena ',
        lastName: ' Vega ',
        roles: ['CAREGIVER', 'PROFESSIONAL'],
        specialty: 'pediatrics',
        licenseNumber: 'MSP-998877',
        invitationCode: 'NK-PROF-2026',
      });

    expect(res.status).toBe(201);
    const parsed = AuthResponseSchema.parse(res.body);
    expect(parsed.requiresTwoFactor).toBe(false);
    if (parsed.requiresTwoFactor) return;

    expect(parsed.user.roles).toEqual(['CAREGIVER', 'PROFESSIONAL']);
    expect(parsed.user.specialty).toBe('pediatrics');
    expect(caregivers).toHaveLength(1);
    expect(professionals).toEqual([
      {
        userId: '00000000-0000-4000-8000-000000000001',
        specialty: 'pediatrics',
        licenseNumber: 'MSP-998877',
      },
    ]);
  });

  it('rechaza con 403 cuando un profesional envía un código de invitación inválido', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: 'intruso@hospital.ec',
        password: 'ClaveDoctora#2026',
        firstName: 'Carlos',
        lastName: 'Ruiz',
        roles: ['PROFESSIONAL'],
        specialty: 'nursing',
        licenseNumber: 'MSP-112233',
        invitationCode: 'CODIGO-INCORRECTO',
      });

    expect(res.status).toBe(403);
    expect(ErrorResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.message).toBe('Código de invitación profesional inválido');
    expect(users).toHaveLength(0);
  });

  it('rechaza con 409 cuando el correo o el número de licencia ya existen', async () => {
    const firstPayload = {
      email: 'duplicado@hospital.ec',
      password: 'ClaveDoctora#2026',
      firstName: 'Laura',
      lastName: 'Paz',
      roles: ['PROFESSIONAL'],
      specialty: 'nutrition',
      licenseNumber: 'MSP-555555',
      invitationCode: 'NK-PROF-2026',
    };

    const firstRes = await request(app).post('/auth/register').send(firstPayload);
    expect(firstRes.status).toBe(201);

    const dupEmailRes = await request(app)
      .post('/auth/register')
      .send({ ...firstPayload, licenseNumber: 'MSP-666666' });
    expect(dupEmailRes.status).toBe(409);
    expect(dupEmailRes.body.message).toBe('El correo electrónico ya está registrado');

    const dupLicenseRes = await request(app)
      .post('/auth/register')
      .send({ ...firstPayload, email: 'otra@hospital.ec' });
    expect(dupLicenseRes.status).toBe(409);
    expect(dupLicenseRes.body.message).toBe('El número de licencia profesional ya está registrado');
  });

  it('rechaza con 400 entradas inválidas o con campos desconocidos', async () => {
    const missingProfFields = await request(app)
      .post('/auth/register')
      .send({
        email: 'incompleto@hospital.ec',
        password: 'ClaveDoctora#2026',
        firstName: 'Pedro',
        lastName: 'Sol',
        roles: ['PROFESSIONAL'],
      });
    expect(missingProfFields.status).toBe(400);

    const extraField = await request(app)
      .post('/auth/register')
      .send({
        email: 'extra@correo.ec',
        password: 'ClaveCuidador#2026',
        firstName: 'Ana',
        lastName: 'Sol',
        roles: ['CAREGIVER'],
        isAdmin: true,
      });
    expect(extraField.status).toBe(400);
  });
});
