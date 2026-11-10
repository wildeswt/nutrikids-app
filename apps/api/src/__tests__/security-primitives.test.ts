import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../lib/password.js';
import {
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
  generateRefreshToken,
  hashRefreshToken,
  isValidProfessionalInviteCode,
  signAccessToken,
  verifyAccessToken,
} from '../services/token.service.js';

describe('hashPassword y verifyPassword (Argon2id)', () => {
  it('genera un hash Argon2id distinto de la contraseña en claro y lo verifica', async () => {
    const plain = 'MiClaveSegura#2026';
    const hashed = await hashPassword(plain);

    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(hashed).not.toContain(plain);
    expect(await verifyPassword(hashed, plain)).toBe(true);
    expect(await verifyPassword(hashed, 'OtraClaveDistinta')).toBe(false);
  });

  it('devuelve false si el hash está corrupto y ejecuta verifyDummyPassword sin fallar', async () => {
    expect(await verifyPassword('no-es-un-hash-valido', 'cualquiera')).toBe(false);
    await expect(verifyDummyPassword('cualquier-clave')).resolves.toBeUndefined();
  });
});

describe('signAccessToken y verifyAccessToken (JWT HS256)', () => {
  const claims = {
    sub: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
    roles: ['CAREGIVER', 'PROFESSIONAL'] as const,
    specialty: 'pediatrics' as const,
  };

  it('firma y verifica un token de acceso válido conservando sub, roles y specialty', async () => {
    const { accessToken, expiresIn } = await signAccessToken({
      sub: claims.sub,
      roles: [...claims.roles],
      specialty: claims.specialty,
    });

    expect(expiresIn).toBe(900);
    const verified = await verifyAccessToken(accessToken);
    expect(verified).toEqual({
      sub: claims.sub,
      roles: ['CAREGIVER', 'PROFESSIONAL'],
      specialty: 'pediatrics',
    });
  });

  it('rechaza tokens expirados, manipulados o firmados con otro secreto', async () => {
    const { accessToken: expiredToken } = await signAccessToken(
      { sub: claims.sub, roles: ['CAREGIVER'], specialty: null },
      { ttlSeconds: -10 },
    );
    await expect(verifyAccessToken(expiredToken)).rejects.toMatchObject({ statusCode: 401 });

    const { accessToken: validToken } = await signAccessToken({
      sub: claims.sub,
      roles: ['CAREGIVER'],
      specialty: null,
    });
    const tampered = `${validToken.slice(0, -4)}abcd`;
    await expect(verifyAccessToken(tampered)).rejects.toMatchObject({ statusCode: 401 });

    await expect(
      verifyAccessToken(validToken, { secret: 'otro-secreto-distinto-de-mas-de-32-chars' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rechaza tokens con issuer o audience inválidos', async () => {
    const secret = 'secreto-para-prueba-unitaria-de-mas-de-32-chars';
    const key = new TextEncoder().encode(secret);

    const wrongIssuerToken = await new SignJWT({ roles: ['CAREGIVER'], specialty: null })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer('otro-emisor')
      .setAudience(TOKEN_AUDIENCE)
      .setExpirationTime('15m')
      .sign(key);

    await expect(verifyAccessToken(wrongIssuerToken, { secret })).rejects.toMatchObject({
      statusCode: 401,
    });

    const wrongAudienceToken = await new SignJWT({ roles: ['CAREGIVER'], specialty: null })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(TOKEN_ISSUER)
      .setAudience('otra-audiencia')
      .setExpirationTime('15m')
      .sign(key);

    await expect(verifyAccessToken(wrongAudienceToken, { secret })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('generateRefreshToken, hashRefreshToken e isValidProfessionalInviteCode', () => {
  it('genera tokens de renovación aleatorios cuyo hash SHA-256 es determinista y distinto del token', () => {
    const first = generateRefreshToken(30);
    const second = generateRefreshToken(30);

    expect(first.refreshToken).not.toBe(second.refreshToken);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toBe(first.refreshToken);
    expect(hashRefreshToken(first.refreshToken)).toBe(first.tokenHash);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('verifica códigos de invitación de profesionales en tiempo constante', () => {
    const allowed = ['NK-PROF-2026', 'PUCE-SALUD-2026'];
    expect(isValidProfessionalInviteCode('NK-PROF-2026', allowed)).toBe(true);
    expect(isValidProfessionalInviteCode('  PUCE-SALUD-2026 ', allowed)).toBe(true);
    expect(isValidProfessionalInviteCode('CODIGO-FALSO', allowed)).toBe(false);
  });
});
