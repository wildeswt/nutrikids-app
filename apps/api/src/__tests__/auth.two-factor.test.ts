import {
  AuthResponseSchema,
  RecoveryCodesResponseSchema,
  type AuthResponse,
} from '@nutrikids/shared';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { decryptSecret } from '../lib/secretBox.js';
import { generateTotp, TOTP_PERIOD_SECONDS } from '../lib/totp.js';
import { hashRefreshToken, verifyAccessToken } from '../services/token.service.js';
import { RECOVERY_CODE_COUNT, hashRecoveryCode } from '../services/twoFactor.service.js';
import {
  EMPTY_TWO_FACTOR,
  mockProfessionalFindByUserId,
  mockTwoFactorStore,
  snapshot,
  type MemProfessionalWith2fa,
} from './helpers/twoFactorStore.js';

/**
 * Flujo completo del segundo factor TOTP obligatorio para profesionales (NK-10, RT-06):
 * activación con QR, exigencia del código antes de entregar tokens, códigos de recuperación
 * de un solo uso, protección contra reutilización y límite de intentos.
 */

type Authenticated = Extract<AuthResponse, { requiresTwoFactor: false }>;

interface MemUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status: string;
  isCaregiver: boolean;
}

const PASSWORD = 'ClaveSegura#2026';
const BASE_TIME = Date.UTC(2026, 10, 14, 12, 0, 0);

const CAREGIVER_ID = '00000000-0000-4000-8000-000000000101';
const PROFESSIONAL_ID = '00000000-0000-4000-8000-000000000102';
const DUAL_ID = '00000000-0000-4000-8000-000000000103';

describe('Segundo factor TOTP para profesionales (NK-10)', () => {
  let passwordHash = '';
  let users: MemUser[] = [];
  let professionals: MemProfessionalWith2fa[] = [];
  let refreshTokens: { userId: string; tokenHash: string; expiresAt: Date }[] = [];
  let auditEvents: { userId: string; details?: unknown }[] = [];
  let now = BASE_TIME;

  /** Avanza el reloj un paso TOTP (30 s) para obtener un código nuevo. */
  function nextStep(): void {
    now += TOTP_PERIOD_SECONDS * 1000;
    vi.setSystemTime(now);
  }

  function login(app: ReturnType<typeof createApp>, email: string, extra: object = {}) {
    return request(app)
      .post('/auth/login')
      .send({ email, password: PASSWORD, ...extra });
  }

  /** Activa el segundo factor de `email` y devuelve la clave y la sesión emitida. */
  async function enroll(app: ReturnType<typeof createApp>, email: string) {
    const challenge = AuthResponseSchema.parse((await login(app, email)).body);
    if (!challenge.requiresTwoFactor || !challenge.setup) throw new Error('Sin QR');
    const { secret } = challenge.setup;
    const res = await login(app, email, { totpCode: generateTotp(secret) });
    expect(res.status).toBe(200);
    const session = AuthResponseSchema.parse(res.body) as Authenticated;
    nextStep();
    return { secret, session };
  }

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    now = BASE_TIME;
    vi.setSystemTime(now);

    refreshTokens = [];
    users = [
      {
        id: CAREGIVER_ID,
        email: 'ana@correo.ec',
        passwordHash,
        firstName: 'Ana',
        lastName: 'Pérez',
        status: 'active',
        isCaregiver: true,
      },
      {
        id: PROFESSIONAL_ID,
        email: 'luis@hospital.ec',
        passwordHash,
        firstName: 'Luis',
        lastName: 'Mora',
        status: 'active',
        isCaregiver: false,
      },
      {
        id: DUAL_ID,
        email: 'elena@hospital.ec',
        passwordHash,
        firstName: 'Elena',
        lastName: 'Vega',
        status: 'active',
        isCaregiver: true,
      },
    ];
    professionals = [
      { userId: PROFESSIONAL_ID, specialty: 'nutrition', ...EMPTY_TWO_FACTOR },
      { userId: DUAL_ID, specialty: 'pediatrics', ...EMPTY_TWO_FACTOR },
    ];

    vi.spyOn(prisma.user, 'findUnique').mockImplementation((async ({
      where,
    }: {
      where: { email: string };
    }) => {
      const u = users.find((item) => item.email === where.email);
      if (!u) return null;
      const professional = professionals.find((p) => p.userId === u.id);
      return {
        ...u,
        caregiver: u.isCaregiver ? { userId: u.id } : null,
        professional: professional ? snapshot(professional) : null,
      };
    }) as never);

    vi.spyOn(prisma.refreshToken, 'create').mockImplementation((async ({
      data,
    }: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }) => {
      refreshTokens.push(data);
      return data;
    }) as never);

    auditEvents = mockTwoFactorStore(() => professionals).auditEvents;
    mockProfessionalFindByUserId(() => professionals);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pide activar el segundo factor con QR sin entregar tokens y reutiliza la misma clave', async () => {
    const app = createApp();

    const first = await login(app, 'luis@hospital.ec');
    expect(first.status).toBe(200);
    expect(first.body).not.toHaveProperty('accessToken');
    expect(first.body).not.toHaveProperty('refreshToken');
    const parsed = AuthResponseSchema.parse(first.body);
    if (!parsed.requiresTwoFactor || !parsed.setup) throw new Error('Se esperaba el QR');

    const { secret, otpauthUri, qrCodeDataUrl } = parsed.setup;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri).toContain('otpauth://totp/NutriKids:luis%40hospital.ec?');
    expect(otpauthUri).toContain(`secret=${secret}`);
    expect(otpauthUri).toContain('issuer=NutriKids');
    expect(qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(refreshTokens).toHaveLength(0);

    // La clave se guarda cifrada (nunca en claro) y aún no está activada.
    const stored = professionals.find((p) => p.userId === PROFESSIONAL_ID)!;
    expect(stored.totpEnabledAt).toBeNull();
    expect(stored.totpSecretEnc).not.toContain(secret);
    expect(decryptSecret(stored.totpSecretEnc!)).toBe(secret);

    // Repetir el primer paso no invalida el QR ya escaneado.
    const second = AuthResponseSchema.parse((await login(app, 'luis@hospital.ec')).body);
    if (!second.requiresTwoFactor) throw new Error('Se esperaba el desafío');
    expect(second.setup?.secret).toBe(secret);
  });

  it('activa el segundo factor con el primer código válido y entrega tokens y códigos de recuperación', async () => {
    const app = createApp();
    const challenge = AuthResponseSchema.parse((await login(app, 'luis@hospital.ec')).body);
    if (!challenge.requiresTwoFactor || !challenge.setup) throw new Error('Sin QR');

    const wrong = await login(app, 'luis@hospital.ec', { totpCode: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe('Código de verificación inválido');
    expect(refreshTokens).toHaveLength(0);

    const recoveryBeforeEnroll = await login(app, 'luis@hospital.ec', {
      recoveryCode: 'ABCD-EFGH',
    });
    expect(recoveryBeforeEnroll.status).toBe(401);

    const res = await login(app, 'luis@hospital.ec', {
      totpCode: generateTotp(challenge.setup.secret),
    });
    expect(res.status).toBe(200);
    const session = AuthResponseSchema.parse(res.body);
    if (session.requiresTwoFactor) throw new Error('Se esperaba la sesión');

    expect(session.user.roles).toEqual(['PROFESSIONAL']);
    expect(refreshTokens[0]?.tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(await verifyAccessToken(session.accessToken)).toEqual({
      sub: PROFESSIONAL_ID,
      roles: ['PROFESSIONAL'],
      specialty: 'nutrition',
    });

    const codes = session.recoveryCodes!;
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const stored = professionals.find((p) => p.userId === PROFESSIONAL_ID)!;
    expect(stored.totpEnabledAt).toBeInstanceOf(Date);
    expect(stored.recoveryCodeHashes).toEqual(codes.map(hashRecoveryCode));
    expect(stored.recoveryCodeHashes.join()).not.toContain(codes[0]);
    expect(auditEvents).toEqual([
      expect.objectContaining({ userId: PROFESSIONAL_ID, details: { twoFactor: 'enabled' } }),
    ]);
  });

  it('con el segundo factor activo exige el código, sin QR ni tokens, y no permite reutilizarlo', async () => {
    const app = createApp();
    const { secret } = await enroll(app, 'luis@hospital.ec');

    const challenge = await login(app, 'luis@hospital.ec');
    expect(challenge.status).toBe(200);
    expect(challenge.body).toEqual({ requiresTwoFactor: true });

    const code = generateTotp(secret);
    const ok = await login(app, 'luis@hospital.ec', { totpCode: code });
    expect(ok.status).toBe(200);
    const session = AuthResponseSchema.parse(ok.body);
    if (session.requiresTwoFactor) throw new Error('Se esperaba la sesión');
    expect(session.recoveryCodes).toBeUndefined();

    // El mismo código (mismo paso de 30 s) no sirve dos veces.
    const replay = await login(app, 'luis@hospital.ec', { totpCode: code });
    expect(replay.status).toBe(401);

    // Un código del paso anterior tampoco, aunque esté dentro de la ventana de tolerancia.
    const previous = generateTotp(secret, now - TOTP_PERIOD_SECONDS * 1000);
    expect((await login(app, 'luis@hospital.ec', { totpCode: previous })).status).toBe(401);

    nextStep();
    expect((await login(app, 'luis@hospital.ec', { totpCode: generateTotp(secret) })).status).toBe(
      200,
    );
  });

  it('acepta cada código de recuperación una sola vez (sin importar guiones ni mayúsculas)', async () => {
    const app = createApp();
    const { session } = await enroll(app, 'luis@hospital.ec');
    const [first, second] = session.recoveryCodes!;

    const used = await login(app, 'luis@hospital.ec', {
      recoveryCode: first!.toLowerCase().replace('-', ''),
    });
    expect(used.status).toBe(200);
    expect(AuthResponseSchema.parse(used.body).requiresTwoFactor).toBe(false);

    const reused = await login(app, 'luis@hospital.ec', { recoveryCode: first });
    expect(reused.status).toBe(401);
    expect(reused.body.message).toBe('Código de verificación inválido');

    expect((await login(app, 'luis@hospital.ec', { recoveryCode: second })).status).toBe(200);
    expect(
      professionals.find((p) => p.userId === PROFESSIONAL_ID)!.recoveryCodeHashes,
    ).toHaveLength(RECOVERY_CODE_COUNT - 2);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({ details: { twoFactor: 'recovery_code_used' } }),
    );
  });

  it('no deja que dos inicios de sesión simultáneos gasten el mismo código de recuperación', async () => {
    const app = createApp();
    const { session } = await enroll(app, 'luis@hospital.ec');
    const code = session.recoveryCodes![0]!;

    const [a, b] = await Promise.all([
      login(app, 'luis@hospital.ec', { recoveryCode: code }),
      login(app, 'luis@hospital.ec', { recoveryCode: code }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('exige el segundo factor también a las cuentas mixtas y no a las de cuidador', async () => {
    const app = createApp();

    const caregiver = await login(app, 'ana@correo.ec', { totpCode: '123456' });
    expect(caregiver.status).toBe(200);
    expect(AuthResponseSchema.parse(caregiver.body).requiresTwoFactor).toBe(false);
    expect(professionals.every((p) => p.totpSecretEnc === null)).toBe(true);

    const dual = AuthResponseSchema.parse((await login(app, 'elena@hospital.ec')).body);
    expect(dual.requiresTwoFactor).toBe(true);
    const { session } = await enroll(app, 'elena@hospital.ec');
    expect(session.user.roles).toEqual(['CAREGIVER', 'PROFESSIONAL']);
  });

  it('regenera los códigos de recuperación con un TOTP vigente e invalida los anteriores', async () => {
    const app = createApp();
    const { secret, session } = await enroll(app, 'luis@hospital.ec');
    const auth = `Bearer ${session.accessToken}`;

    const status = await request(app).get('/auth/2fa/status').set('Authorization', auth);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ enabled: true, recoveryCodesRemaining: RECOVERY_CODE_COUNT });

    const wrong = await request(app)
      .post('/auth/2fa/recovery-codes')
      .set('Authorization', auth)
      .send({ totpCode: '000000' });
    expect(wrong.status).toBe(401);

    const res = await request(app)
      .post('/auth/2fa/recovery-codes')
      .set('Authorization', auth)
      .send({ totpCode: generateTotp(secret) });
    expect(res.status).toBe(200);
    const { recoveryCodes } = RecoveryCodesResponseSchema.parse(res.body);
    expect(recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(recoveryCodes).not.toContain(session.recoveryCodes![0]);

    expect(
      (await login(app, 'luis@hospital.ec', { recoveryCode: session.recoveryCodes![0] })).status,
    ).toBe(401);
    expect((await login(app, 'luis@hospital.ec', { recoveryCode: recoveryCodes[0] })).status).toBe(
      200,
    );
  });

  it('protege los endpoints de gestión: sin token 401 y cuidadores 403', async () => {
    const app = createApp();
    expect((await request(app).get('/auth/2fa/status')).status).toBe(401);

    const caregiver = AuthResponseSchema.parse((await login(app, 'ana@correo.ec')).body);
    if (caregiver.requiresTwoFactor) throw new Error('Se esperaba la sesión');
    const res = await request(app)
      .post('/auth/2fa/recovery-codes')
      .set('Authorization', `Bearer ${caregiver.accessToken}`)
      .send({ totpCode: '123456' });
    expect(res.status).toBe(403);
  });

  it('bloquea con 429 tras 5 códigos incorrectos', async () => {
    const app = createApp();
    await enroll(app, 'luis@hospital.ec');

    for (let i = 0; i < 5; i += 1) {
      const res = await login(app, 'luis@hospital.ec', { totpCode: '000000' });
      expect(res.status).toBe(401);
    }
    const blocked = await login(app, 'luis@hospital.ec', { totpCode: '000000' });
    expect(blocked.status).toBe(429);
  });
});

describe('Registro y renovación de profesionales sin segundo factor (NK-10)', () => {
  it('no renueva sesiones de profesionales que aún no activaron el segundo factor', async () => {
    vi.spyOn(prisma.refreshToken, 'findUnique').mockResolvedValue({
      id: '00000000-0000-4000-9000-000000000001',
      userId: PROFESSIONAL_ID,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: PROFESSIONAL_ID,
        email: 'luis@hospital.ec',
        firstName: 'Luis',
        lastName: 'Mora',
        status: 'active',
        caregiver: null,
        professional: { userId: PROFESSIONAL_ID, specialty: 'nutrition', totpEnabledAt: null },
      },
    } as never);
    const create = vi.spyOn(prisma.refreshToken, 'create');

    const res = await request(createApp())
      .post('/auth/refresh')
      .send({ refreshToken: 'token-anterior-al-2fa' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/verificación en dos pasos/);
    expect(create).not.toHaveBeenCalled();
  });
});
