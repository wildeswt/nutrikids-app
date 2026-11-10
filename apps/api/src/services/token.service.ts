import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  SpecialtySchema,
  UserRoleSchema,
  UuidSchema,
  type Specialty,
  type UserRole,
} from '@nutrikids/shared';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

export const TOKEN_ISSUER = 'nutrikids-api';
export const TOKEN_AUDIENCE = 'nutrikids-app';
export const PASSWORD_RESET_AUDIENCE = 'nutrikids-password-reset';

const AccessTokenClaimsSchema = z.object({
  sub: UuidSchema,
  roles: z.array(UserRoleSchema).min(1),
  specialty: SpecialtySchema.nullable(),
});

const PasswordResetClaimsSchema = z.object({
  sub: UuidSchema,
  pwdFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
export type PasswordResetClaims = z.infer<typeof PasswordResetClaimsSchema>;

export interface TokenConfigOverrides {
  secret?: string;
  ttlSeconds?: number;
}

function getSecretKey(secret = env.JWT_ACCESS_SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Firma un token de acceso JWT (HS256) de corta duración con el id del usuario,
 * sus roles y su especialidad.
 */
export async function signAccessToken(
  claims: AccessTokenClaims,
  overrides?: TokenConfigOverrides,
): Promise<{ accessToken: string; expiresIn: number }> {
  const ttlSeconds = overrides?.ttlSeconds ?? env.ACCESS_TOKEN_TTL_SECONDS;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const accessToken = await new SignJWT({
    roles: claims.roles satisfies UserRole[],
    specialty: claims.specialty satisfies Specialty | null,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(getSecretKey(overrides?.secret));

  return { accessToken, expiresIn: ttlSeconds };
}

/**
 * Verifica la firma, vigencia, emisor (`iss`) y audiencia (`aud`) de un token de acceso
 * y devuelve las claims validadas. Lanza `HttpError(401)` si el token es inválido o venció.
 */
export async function verifyAccessToken(
  token: string,
  overrides?: Pick<TokenConfigOverrides, 'secret'>,
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(overrides?.secret), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    });

    const parsed = AccessTokenClaimsSchema.safeParse({
      sub: payload.sub,
      roles: payload.roles,
      specialty: payload.specialty ?? null,
    });

    if (!parsed.success) {
      throw HttpError.unauthorized('Token de acceso inválido');
    }

    return parsed.data;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw HttpError.unauthorized('Token de acceso inválido o expirado');
  }
}

/**
 * Calcula una huella SHA-256 del hash de contraseña actual para ligar un token de
 * restablecimiento a la contraseña vigente (garantiza que sea de un solo uso sin tabla adicional).
 */
export function computePasswordHashFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash, 'utf8').digest('hex');
}

/**
 * Firma un token de recuperación de contraseña de corta duración (15 min) ligado a la
 * huella del `passwordHash` actual. En cuanto la contraseña cambia, el token queda invalidado.
 */
export async function signPasswordResetToken(
  userId: string,
  passwordHash: string,
  overrides?: TokenConfigOverrides,
): Promise<string> {
  const ttlSeconds = overrides?.ttlSeconds ?? 900;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const pwdFingerprint = computePasswordHashFingerprint(passwordHash);

  return new SignJWT({ pwdFingerprint })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(PASSWORD_RESET_AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(getSecretKey(overrides?.secret));
}

/**
 * Verifica un token de recuperación de contraseña y devuelve `{ sub, pwdFingerprint }`.
 */
export async function verifyPasswordResetToken(
  token: string,
  overrides?: Pick<TokenConfigOverrides, 'secret'>,
): Promise<PasswordResetClaims> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(overrides?.secret), {
      issuer: TOKEN_ISSUER,
      audience: PASSWORD_RESET_AUDIENCE,
      algorithms: ['HS256'],
    });

    const parsed = PasswordResetClaimsSchema.safeParse({
      sub: payload.sub,
      pwdFingerprint: payload.pwdFingerprint,
    });

    if (!parsed.success) {
      throw HttpError.unauthorized('Token de recuperación inválido');
    }

    return parsed.data;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw HttpError.unauthorized('Token de recuperación inválido o expirado');
  }
}

/**
 * Genera un token de renovación opaco de alta entropía (256 bits) y su fecha de expiración.
 */
export function generateRefreshToken(ttlDays = env.REFRESH_TOKEN_TTL_DAYS): {
  refreshToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const refreshToken = randomBytes(32).toString('base64url');
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  return { refreshToken, tokenHash, expiresAt };
}

/**
 * Calcula el hash SHA-256 (hex) de un token de renovación para guardarlo o buscarlo en BD.
 */
export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

/**
 * Compara en tiempo constante un código de invitación contra la lista configurada.
 */
export function isValidProfessionalInviteCode(
  candidate: string,
  allowedCodes: readonly string[] = env.PROFESSIONAL_INVITE_CODES,
): boolean {
  const candidateDigest = createHash('sha256').update(candidate.trim(), 'utf8').digest();
  let matched = false;
  for (const allowed of allowedCodes) {
    const allowedDigest = createHash('sha256').update(allowed.trim(), 'utf8').digest();
    if (timingSafeEqual(candidateDigest, allowedDigest)) {
      matched = true;
    }
  }
  return matched;
}
