import {
  AuthResponseSchema,
  ForgotPasswordResponseSchema,
  SpecialtySchema,
  type AuthResponse,
  type ForgotPasswordInput,
  type ForgotPasswordResponse,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
  type Specialty,
  type UserRole,
} from '@nutrikids/shared';
import { HttpError } from '../lib/http-error.js';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import {
  computePasswordHashFingerprint,
  generateRefreshToken,
  hashRefreshToken,
  isValidProfessionalInviteCode,
  signAccessToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
} from './token.service.js';
import { checkLoginSecondFactor, professionalTwoFactorSelect } from './twoFactor.service.js';

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

const SPECIALTY_MAP: Record<string, Specialty> = {
  nursing: 'nursing',
  enfermeria: 'nursing',
  nutrition: 'nutrition',
  nutricion: 'nutrition',
  pediatrics: 'pediatrics',
  pediatria: 'pediatrics',
};

function normalizeSpecialty(raw: string | null | undefined): Specialty | null {
  if (!raw) return null;
  const mapped = SPECIALTY_MAP[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  const parsed = SpecialtySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function resolveUserRoles(user: {
  caregiver: { userId: string } | null;
  professional: { userId: string; specialty: string } | null;
}): UserRole[] {
  const roles: UserRole[] = [];
  if (user.caregiver) {
    roles.push('CAREGIVER');
  }
  if (user.professional) {
    roles.push('PROFESSIONAL');
  }
  if (roles.length === 0) {
    throw HttpError.forbidden('La cuenta no tiene un perfil asignado');
  }
  return roles;
}

export type PasswordResetNotifier = (email: string, resetToken: string) => void | Promise<void>;

let passwordResetNotifier: PasswordResetNotifier = () => {};

/**
 * Configura el canal de entrega del token de recuperación (para pruebas o proveedor de correo).
 */
export function setPasswordResetNotifier(notifier: PasswordResetNotifier): void {
  passwordResetNotifier = notifier;
}

/**
 * Registra un nuevo usuario (cuidador, profesional o ambos) en una transacción:
 * - Si el rol incluye `PROFESSIONAL`, verifica el código de invitación configurado.
 * - Almacena la contraseña con hash Argon2id (nunca en claro).
 * - Crea las filas en `users`, `caregivers`/`professionals` y `refresh_tokens`.
 * - Devuelve `AuthResponse` con tokens, roles y especialidad. Si el rol incluye `PROFESSIONAL`,
 *   no emite tokens: responde `{ requiresTwoFactor: true }` y la activación del segundo
 *   factor ocurre en el primer inicio de sesión (NK-10).
 */
export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  const isCaregiver = input.roles.includes('CAREGIVER');
  const isProfessional = input.roles.includes('PROFESSIONAL');

  if (isProfessional) {
    if (!input.invitationCode || !isValidProfessionalInviteCode(input.invitationCode)) {
      throw HttpError.forbidden('Código de invitación profesional inválido');
    }
  }

  const passwordHash = await hashPassword(input.password);
  const { refreshToken, tokenHash, expiresAt } = generateRefreshToken();
  // Las cuentas profesionales deben activar el segundo factor antes de recibir tokens (NK-10).
  const issueSession = !isProfessional;

  let createdUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: UserRole[];
    specialty: Specialty | null;
    licenseNumber: string | null;
  };

  try {
    createdUser = await prisma.$transaction(async (tx) => {
      const existingEmail = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingEmail) {
        throw HttpError.conflict('El correo electrónico ya está registrado');
      }

      if (isProfessional && input.licenseNumber) {
        const existingLicense = await tx.professional.findUnique({
          where: { licenseNumber: input.licenseNumber },
          select: { userId: true },
        });
        if (existingLicense) {
          throw HttpError.conflict('El número de licencia profesional ya está registrado');
        }
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (isCaregiver) {
        await tx.caregiver.create({
          data: {
            userId: user.id,
            phone: input.phone ?? null,
          },
        });
      }

      if (isProfessional && input.specialty && input.licenseNumber) {
        await tx.professional.create({
          data: {
            userId: user.id,
            specialty: input.specialty,
            licenseNumber: input.licenseNumber,
          },
        });
      }

      if (issueSession) {
        await tx.refreshToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
      }

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: input.roles,
        specialty: isProfessional && input.specialty ? input.specialty : null,
        licenseNumber: isProfessional && input.licenseNumber ? input.licenseNumber : null,
      };
    });
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    if (isUniqueConstraintError(err)) {
      throw HttpError.conflict('El correo electrónico o número de licencia ya está registrado');
    }
    throw err;
  }

  if (!issueSession) {
    return AuthResponseSchema.parse({ requiresTwoFactor: true });
  }

  const { accessToken, expiresIn } = await signAccessToken({
    sub: createdUser.id,
    roles: createdUser.roles,
    specialty: createdUser.specialty,
  });

  return AuthResponseSchema.parse({
    requiresTwoFactor: false,
    accessToken,
    refreshToken,
    expiresIn,
    user: createdUser,
  });
}

/**
 * Inicia sesión verificando correo y contraseña con Argon2id:
 * - Si el correo no existe, ejecuta `verifyDummyPassword` para igualar tiempos.
 * - Rechaza cuentas suspendidas (`status !== 'active'`).
 * - Determina los roles (`CAREGIVER`, `PROFESSIONAL` o ambos) y la especialidad.
 * - Si la cuenta tiene perfil profesional, exige el segundo factor TOTP (NK-10): sin código
 *   responde `{ requiresTwoFactor: true }` (con `setup` y el QR si aún no lo activó) y no
 *   emite tokens; con un código TOTP o de recuperación válido continúa.
 * - Emite un JWT de acceso de corta duración y guarda el hash SHA-256 del refresh token.
 */
export async function loginUser(input: LoginInput): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      firstName: true,
      lastName: true,
      status: true,
      caregiver: { select: { userId: true } },
      professional: { select: { ...professionalTwoFactorSelect, licenseNumber: true } },
    },
  });

  if (!user) {
    await verifyDummyPassword(input.password);
    throw HttpError.unauthorized('Credenciales inválidas');
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, input.password);
  if (!isPasswordValid) {
    throw HttpError.unauthorized('Credenciales inválidas');
  }

  if (user.status !== 'active') {
    throw HttpError.forbidden('La cuenta está suspendida');
  }

  const roles = resolveUserRoles(user);
  const specialty = normalizeSpecialty(user.professional?.specialty);

  // Segundo factor obligatorio para cualquier cuenta con perfil profesional (NK-10, RT-06).
  let recoveryCodes: string[] | undefined;
  if (user.professional) {
    const outcome = await checkLoginSecondFactor(user.email, user.professional, {
      totpCode: input.totpCode,
      recoveryCode: input.recoveryCode,
    });
    if (outcome.status === 'challenge') {
      return AuthResponseSchema.parse({ requiresTwoFactor: true, setup: outcome.setup });
    }
    recoveryCodes = outcome.recoveryCodes;
  }

  const { refreshToken, tokenHash, expiresAt } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const { accessToken, expiresIn } = await signAccessToken({
    sub: user.id,
    roles,
    specialty,
  });

  return AuthResponseSchema.parse({
    requiresTwoFactor: false,
    accessToken,
    refreshToken,
    expiresIn,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      specialty,
      licenseNumber: user.professional?.licenseNumber ?? null,
    },
    ...(recoveryCodes ? { recoveryCodes } : {}),
  });
}

/**
 * Renueva la sesión con rotación de refresh token:
 * - Si el token no existe o venció, responde 401.
 * - Si el token ya estaba revocado (reutilización), revoca todas las sesiones activas
 *   del usuario por seguridad y responde 401.
 * - En caso válido, revoca el token actual de forma atómica y emite un par nuevo.
 */
export async function refreshUserSession(input: RefreshInput): Promise<AuthResponse> {
  const incomingHash = hashRefreshToken(input.refreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: incomingHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          caregiver: { select: { userId: true } },
          professional: {
            select: { userId: true, specialty: true, totpEnabledAt: true, licenseNumber: true },
          },
        },
      },
    },
  });

  if (!stored) {
    throw HttpError.unauthorized('Token de renovación inválido');
  }

  const now = new Date();

  if (stored.revokedAt !== null) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw HttpError.unauthorized(
      'Token de renovación reutilizado; se revocaron las sesiones activas',
    );
  }

  if (stored.expiresAt.getTime() <= now.getTime()) {
    throw HttpError.unauthorized('Token de renovación expirado');
  }

  if (stored.user.status !== 'active') {
    throw HttpError.forbidden('La cuenta está suspendida');
  }

  // Sesiones de profesionales emitidas antes de activar el segundo factor no se renuevan.
  if (stored.user.professional && !stored.user.professional.totpEnabledAt) {
    throw HttpError.unauthorized(
      'Debes activar la verificación en dos pasos; inicia sesión nuevamente',
    );
  }

  const roles = resolveUserRoles(stored.user);
  const specialty = normalizeSpecialty(stored.user.professional?.specialty);
  const {
    refreshToken: newRefreshToken,
    tokenHash: newTokenHash,
    expiresAt: newExpiresAt,
  } = generateRefreshToken();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });

    if (updated.count === 0) {
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw HttpError.unauthorized(
        'Token de renovación reutilizado; se revocaron las sesiones activas',
      );
    }

    await tx.refreshToken.create({
      data: {
        userId: stored.user.id,
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      },
    });
  });

  const { accessToken, expiresIn } = await signAccessToken({
    sub: stored.user.id,
    roles,
    specialty,
  });

  return AuthResponseSchema.parse({
    requiresTwoFactor: false,
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn,
    user: {
      id: stored.user.id,
      email: stored.user.email,
      firstName: stored.user.firstName,
      lastName: stored.user.lastName,
      roles,
      specialty,
      licenseNumber: stored.user.professional?.licenseNumber ?? null,
    },
  });
}

/**
 * Cierra la sesión revocando el refresh token indicado (operación idempotente).
 */
export async function logoutUser(input: LogoutInput): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Solicita un restablecimiento de contraseña (`POST /auth/forgot-password`).
 * Siempre responde con el mismo mensaje sin revelar si el correo existe.
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<ForgotPasswordResponse> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
    },
  });

  if (user && user.status === 'active') {
    const resetToken = await signPasswordResetToken(user.id, user.passwordHash);
    await passwordResetNotifier(user.email, resetToken);
  }

  return ForgotPasswordResponseSchema.parse({
    message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña',
  });
}

/**
 * Restablece la contraseña usando un token de recuperación de un solo uso (`POST /auth/reset-password`).
 * Al cambiar el `passwordHash`, el token queda automáticamente invalidado y se revocan
 * todos los refresh tokens activos del usuario.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const claims = await verifyPasswordResetToken(input.token);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      passwordHash: true,
      status: true,
    },
  });

  if (!user || user.status !== 'active') {
    throw HttpError.unauthorized('Token de recuperación inválido o ya utilizado');
  }

  const currentFingerprint = computePasswordHashFingerprint(user.passwordHash);
  if (currentFingerprint !== claims.pwdFingerprint) {
    throw HttpError.unauthorized('Token de recuperación inválido o ya utilizado');
  }

  const newPasswordHash = await hashPassword(input.newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash: newPasswordHash },
    });

    if (updated.count === 0) {
      throw HttpError.unauthorized('Token de recuperación inválido o ya utilizado');
    }

    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });
}
