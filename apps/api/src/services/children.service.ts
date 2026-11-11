import crypto from 'node:crypto';
import {
  isAgeInOmsRange,
  type AssignProfessionalInput,
  type ChildResponse,
  type CreateChildInput,
  type EndProfessionalAssignmentInput,
  type ProfessionalAssignmentResponse,
} from '@nutrikids/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';

function utcTodayDate(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function parseIsoDateUtc(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
}

function formatChildResponse(child: {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  sex: ChildResponse['sex'];
}): ChildResponse {
  return {
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    birthDate: child.birthDate.toISOString().slice(0, 10),
    sex: child.sex,
  };
}

function formatProfessionalAssignmentResponse(assignment: {
  id: string;
  childId: string;
  professionalId: string;
  startDate: Date;
  endDate: Date | null;
  professional: {
    specialty: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}): ProfessionalAssignmentResponse {
  return {
    id: assignment.id,
    childId: assignment.childId,
    professionalId: assignment.professionalId,
    specialty: assignment.professional.specialty,
    firstName: assignment.professional.user.firstName,
    lastName: assignment.professional.user.lastName,
    startDate: assignment.startDate.toISOString().slice(0, 10),
    endDate: assignment.endDate ? assignment.endDate.toISOString().slice(0, 10) : null,
  };
}

/**
 * Verifica que el usuario autenticado pueda crear o finalizar vínculos `atiende` sobre el niño:
 * debe ser su representante legal (`isLegalRepresentative = true`) o un profesional con vínculo vigente.
 */
async function assertCanManageProfessionalLinks(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  childId: string,
): Promise<void> {
  if (auth.roles.includes('CAREGIVER')) {
    const caregiverLink = await tx.caregiverChild.findUnique({
      where: { caregiverId_childId: { caregiverId: auth.userId, childId } },
      select: { isLegalRepresentative: true },
    });
    if (caregiverLink?.isLegalRepresentative) {
      return;
    }
  }

  if (auth.roles.includes('PROFESSIONAL')) {
    const today = utcTodayDate();
    const activeProfLink = await tx.professionalChild.findFirst({
      where: {
        childId,
        professionalId: auth.userId,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      select: { id: true },
    });
    if (activeProfLink) {
      return;
    }
  }

  throw HttpError.forbidden(
    'Solo el representante legal o un profesional con vínculo vigente puede gestionar vínculos de atención',
  );
}

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
  const birthDate = parseIsoDateUtc(input.birthDate);

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

    return formatChildResponse(createdChild);
  });
}

/**
 * Lista todos los niños vinculados al usuario autenticado (cuidador vía `cuida` o profesional vía `atiende` vigente).
 */
export async function listChildren(auth: AuthContext): Promise<ChildResponse[]> {
  const today = utcTodayDate();

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

    return children.map(formatChildResponse);
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

    return formatChildResponse(child);
  });
}

/**
 * Lista los vínculos `atiende` (activos e históricos) de un niño.
 */
export async function listChildProfessionals(
  auth: AuthContext,
  childId: string,
): Promise<ProfessionalAssignmentResponse[]> {
  return withUser(auth.userId, async (tx) => {
    const assignments = await tx.professionalChild.findMany({
      where: { childId },
      orderBy: [{ startDate: 'desc' }],
      include: {
        professional: {
          select: {
            specialty: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return assignments.map(formatProfessionalAssignmentResponse);
  });
}

/**
 * Asigna un profesional a un niño (`atiende` con `startDate` y `endDate` opcional).
 * Solo permitido al representante legal del niño o a otro profesional con vínculo vigente.
 */
export async function assignProfessional(
  auth: AuthContext,
  childId: string,
  input: AssignProfessionalInput,
): Promise<ProfessionalAssignmentResponse> {
  const startDate = input.startDate ? parseIsoDateUtc(input.startDate) : utcTodayDate();
  const endDate = input.endDate ? parseIsoDateUtc(input.endDate) : null;

  if (endDate && endDate < startDate) {
    throw HttpError.badRequest('La fecha de fin no puede ser anterior a la de inicio');
  }

  return withUser(auth.userId, async (tx) => {
    await assertCanManageProfessionalLinks(tx, auth, childId);

    const professional = await tx.professional.findUnique({
      where: { userId: input.professionalId },
      select: {
        userId: true,
        user: { select: { status: true } },
      },
    });

    if (!professional || professional.user.status !== 'active') {
      throw HttpError.notFound('Profesional no encontrado o inactivo');
    }

    const existingOverlap = await tx.professionalChild.findFirst({
      where: {
        childId,
        professionalId: input.professionalId,
        ...(endDate ? { startDate: { lte: endDate } } : {}),
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
      select: { id: true },
    });

    if (existingOverlap) {
      throw HttpError.conflict(
        'El profesional ya tiene un vínculo vigente o solapado con este niño',
      );
    }

    const created = await tx.professionalChild.create({
      data: {
        childId,
        professionalId: input.professionalId,
        startDate,
        endDate,
      },
      include: {
        professional: {
          select: {
            specialty: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return formatProfessionalAssignmentResponse(created);
  });
}

/**
 * Finaliza la asignación vigente de un profesional con un niño estableciendo `endDate`.
 * Solo permitido al representante legal del niño o a un profesional con vínculo vigente.
 */
export async function endProfessionalAssignment(
  auth: AuthContext,
  childId: string,
  professionalId: string,
  input: EndProfessionalAssignmentInput,
): Promise<ProfessionalAssignmentResponse> {
  const endDate = parseIsoDateUtc(input.endDate);
  const today = utcTodayDate();

  return withUser(auth.userId, async (tx) => {
    await assertCanManageProfessionalLinks(tx, auth, childId);

    const assignment = await tx.professionalChild.findFirst({
      where: {
        childId,
        professionalId,
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      orderBy: [{ startDate: 'desc' }],
    });

    if (!assignment) {
      throw HttpError.notFound('No existe un vínculo vigente con ese profesional para este niño');
    }

    if (endDate < assignment.startDate) {
      throw HttpError.badRequest(
        'La fecha de fin no puede ser anterior a la fecha de inicio del vínculo',
      );
    }

    const updated = await tx.professionalChild.update({
      where: { id: assignment.id },
      data: { endDate },
      include: {
        professional: {
          select: {
            specialty: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return formatProfessionalAssignmentResponse(updated);
  });
}
