import {
  AuthResponseSchema,
  type AuthResponse,
  type RegisterInput,
  type Specialty,
  type UserRole,
} from '@nutrikids/shared';
import { HttpError } from '../lib/http-error.js';
import { hashPassword } from '../lib/password.js';
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
