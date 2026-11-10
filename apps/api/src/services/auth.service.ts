import {
  AuthResponseSchema,
  SpecialtySchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
  type Specialty,
  type UserRole,
} from '@nutrikids/shared';
import { HttpError } from '../lib/http-error.js';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import {
  generateRefreshToken,
  isValidProfessionalInviteCode,
  signAccessToken,
} from './token.service.js';

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

/**
 * Registra un nuevo usuario (cuidador, profesional o ambos) en una transacción:
 * - Si el rol incluye `PROFESSIONAL`, verifica el código de invitación configurado.
 * - Almacena la contraseña con hash Argon2id (nunca en claro).
 * - Crea las filas en `users`, `caregivers`/`professionals` y `refresh_tokens`.
 * - Devuelve `AuthResponse` con tokens, roles y especialidad.
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

  let createdUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: UserRole[];
    specialty: Specialty | null;
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

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: input.roles,
        specialty: isProfessional && input.specialty ? input.specialty : null,
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
      professional: { select: { userId: true, specialty: true } },
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

  const specialty = normalizeSpecialty(user.professional?.specialty);
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
    },
  });
}
