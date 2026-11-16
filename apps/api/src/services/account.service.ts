import type { AccountResponse, UpdateAccountInput } from '@nutrikids/shared';
import { HttpError } from '../lib/http-error.js';
import { verifyPassword } from '../lib/password.js';
import type { AuthContext } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';
import { logAuditEvent } from './audit.service.js';
import { decryptPhone, decryptUserNames, encryptPhone, encryptUserNames } from './pii.service.js';

/**
 * Cuenta del usuario autenticado (NK-55, RF-20): ver y editar nombre, correo y teléfono.
 * Cambiar el correo (credencial de inicio de sesión) exige la contraseña actual.
 */

const accountSelect = {
  id: true,
  email: true,
  firstNameEnc: true,
  lastNameEnc: true,
  passwordHash: true,
  caregiver: { select: { phoneEnc: true } },
} as const;

function format(user: {
  id: string;
  email: string;
  firstNameEnc: string;
  lastNameEnc: string;
  caregiver: { phoneEnc: string | null } | null;
}): AccountResponse {
  const { firstName, lastName } = decryptUserNames(user);
  const phone = decryptPhone(user.caregiver?.phoneEnc);
  return {
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    phone,
  };
}

export async function getAccount(auth: AuthContext): Promise<AccountResponse> {
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: accountSelect });
  if (!user) throw HttpError.notFound('Cuenta no encontrada');
  return format(user);
}

export async function updateAccount(
  auth: AuthContext,
  input: UpdateAccountInput,
): Promise<AccountResponse> {
  const current = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: accountSelect,
  });
  if (!current) throw HttpError.notFound('Cuenta no encontrada');

  const changesEmail = input.email !== undefined && input.email !== current.email;
  if (changesEmail) {
    const valid = await verifyPassword(current.passwordHash, input.currentPassword ?? '');
    if (!valid) throw HttpError.forbidden('La contraseña actual no es correcta');
  }

  const fields: string[] = [];
  if (input.firstName !== undefined) fields.push('firstName');
  if (input.lastName !== undefined) fields.push('lastName');
  if (changesEmail) fields.push('email');
  if (input.phone !== undefined && current.caregiver) fields.push('phone');

  const currentNames = decryptUserNames(current);
  const newFirstName = input.firstName !== undefined ? input.firstName : currentNames.firstName;
  const newLastName = input.lastName !== undefined ? input.lastName : currentNames.lastName;

  const namesChanged = input.firstName !== undefined || input.lastName !== undefined;
  const encryptedNames = namesChanged
    ? encryptUserNames({ firstName: newFirstName, lastName: newLastName })
    : {};

  const phoneUpdate =
    input.phone !== undefined && current.caregiver
      ? { caregiver: { update: { phoneEnc: encryptPhone(input.phone) } } }
      : {};

  try {
    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: {
        ...(changesEmail ? { email: input.email as string } : {}),
        ...encryptedNames,
        ...phoneUpdate,
      },
      select: accountSelect,
    });

    if (fields.length > 0) {
      // Solo los nombres de los campos, nunca los valores (correo, teléfono).
      await logAuditEvent({
        userId: auth.userId,
        action: 'UPDATE',
        entityType: 'users',
        entityId: auth.userId,
        details: { fields },
      });
    }
    return format(updated);
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
      throw HttpError.conflict('Ese correo ya está registrado');
    }
    throw err;
  }
}
