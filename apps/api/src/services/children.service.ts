import crypto from 'node:crypto';
import { isAgeInOmsRange, type ChildResponse, type CreateChildInput } from '@nutrikids/shared';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';

/**
 * Valida que la edad del niño esté en el rango cubierto por los patrones de la OMS (12 a 60 meses).
 * Usado tanto al crear un niño como al registrar controles futuros (RF-03, RT-08).
 */
export function assertChildAgeInOmsRange(
  birthDate: string | Date,
  referenceDate: string | Date = new Date(),
): void {
  const birthIso =
    typeof birthDate === 'string' ? birthDate.slice(0, 10) : birthDate.toISOString().slice(0, 10);
  const refIso =
    typeof referenceDate === 'string'
      ? referenceDate.slice(0, 10)
      : referenceDate.toISOString().slice(0, 10);

  if (!isAgeInOmsRange(birthIso, refIso)) {
    throw HttpError.badRequest(
      'El niño debe tener entre 12 y 60 meses cumplidos para los cálculos de la OMS',
    );
  }
}

/**
 * Da de alta a un niño de forma atómica:
 * 1. Verifica rol cuidador y que quien registra actúe como representante legal.
 * 2. Verifica edad entre 12 y 60 meses.
 * 3. En una sola transacción con RLS: crea `caregiver_children`, `children` (datos mínimos) y `consents`.
 */
export async function createChild(
  auth: AuthContext,
  input: CreateChildInput,
): Promise<ChildResponse> {
  if (!auth.roles.includes('CAREGIVER')) {
    throw HttpError.forbidden('Solo un cuidador puede dar de alta a un niño');
  }

  if (!input.isLegalRepresentative) {
    throw HttpError.forbidden('El alta del niño debe ser realizada por su representante legal');
  }

  assertChildAgeInOmsRange(input.birthDate);

  const childId = crypto.randomUUID();
  const consentId = crypto.randomUUID();
  const birthDate = new Date(`${input.birthDate}T00:00:00.000Z`);

  return withUser(auth.userId, async (tx) => {
    // 1. Insertamos caregiverChild primero (FK diferida en BD).
    await tx.caregiverChild.create({
      data: {
        caregiverId: auth.userId,
        childId,
        relationship: input.relationship,
        isLegalRepresentative: true,
      },
    });

    // 2. Insertamos el niño con solo los datos mínimos del informe.
    const createdChild = await tx.child.create({
      data: {
        id: childId,
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate,
        sex: input.sex,
      },
    });

    // 3. Insertamos el consentimiento inicial atómicamente.
    await tx.consent.create({
      data: {
        id: consentId,
        childId,
        caregiverId: auth.userId,
        textVersion: input.consentTextVersion || 'v1',
      },
    });

    return {
      id: createdChild.id,
      firstName: createdChild.firstName,
      lastName: createdChild.lastName,
      birthDate: createdChild.birthDate.toISOString().slice(0, 10),
      sex: createdChild.sex,
    };
  });
}

/**
 * Lista todos los niños vinculados al usuario autenticado (cuidador vía `cuida` o profesional vía `atiende` vigente).
 */
export async function listChildren(auth: AuthContext): Promise<ChildResponse[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return withUser(auth.userId, async (tx) => {
    const children = await tx.child.findMany({
      where: {
        OR: [
          {
            caregiverChildren: {
              some: { caregiverId: auth.userId },
            },
          },
          {
            professionalChildren: {
              some: {
                professionalId: auth.userId,
                startDate: { lte: today },
                OR: [{ endDate: null }, { endDate: { gte: today } }],
              },
            },
          },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return children.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      birthDate: c.birthDate.toISOString().slice(0, 10),
      sex: c.sex,
    }));
  });
}

/**
 * Obtiene los datos mínimos de un niño por su ID. La autorización por vínculo se garantiza previamente en `requireVinculo`.
 */
export async function getChildById(auth: AuthContext, childId: string): Promise<ChildResponse> {
  return withUser(auth.userId, async (tx) => {
    const child = await tx.child.findUnique({
      where: { id: childId },
    });

    if (!child) {
      throw HttpError.notFound('Niño no encontrado');
    }

    return {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      birthDate: child.birthDate.toISOString().slice(0, 10),
      sex: child.sex,
    };
  });
}
