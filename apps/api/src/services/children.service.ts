import crypto from 'node:crypto';
import {
  isAgeInOmsRange,
  type AssignCaregiverInput,
  type AssignProfessionalInput,
  type CaregiverAssignmentResponse,
  type ChildResponse,
  type ConsentResponse,
  type CreateChildInput,
  type EndProfessionalAssignmentInput,
  type GrantConsentInput,
  type ProfessionalAssignmentResponse,
  type UpdateCaregiverLinkInput,
} from '@nutrikids/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';
import { decryptChildNames, decryptUserNames, encryptChildNames } from './pii.service.js';

function utcTodayDate(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function parseIsoDateUtc(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
}

export function formatChildResponse(child: {
  id: string;
  firstNameEnc: string;
  lastNameEnc: string;
  birthDate: Date;
  sex: ChildResponse['sex'];
}): ChildResponse {
  const { firstName, lastName } = decryptChildNames(child);
  return {
    id: child.id,
    firstName,
    lastName,
    birthDate: child.birthDate.toISOString().slice(0, 10),
    sex: child.sex,
  };
}

function formatConsentResponse(consent: {
  id: string;
  childId: string;
  caregiverId: string;
  textVersion: string;
  grantedAt: Date;
  revokedAt: Date | null;
}): ConsentResponse {
  return {
    id: consent.id,
    childId: consent.childId,
    grantedById: consent.caregiverId,
    textVersion: consent.textVersion,
    grantedAt: consent.grantedAt.toISOString(),
    revokedAt: consent.revokedAt ? consent.revokedAt.toISOString() : null,
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
      firstNameEnc: string;
      lastNameEnc: string;
    };
  };
}): ProfessionalAssignmentResponse {
  const { firstName, lastName } = decryptUserNames(assignment.professional.user);
  return {
    id: assignment.id,
    childId: assignment.childId,
    professionalId: assignment.professionalId,
    specialty: assignment.professional.specialty,
    firstName,
    lastName,
    startDate: assignment.startDate.toISOString().slice(0, 10),
    endDate: assignment.endDate ? assignment.endDate.toISOString().slice(0, 10) : null,
  };
}

function formatCaregiverAssignmentResponse(assignment: {
  caregiverId: string;
  childId: string;
  relationship: string;
  isLegalRepresentative: boolean;
  caregiver: {
    user: {
      firstNameEnc: string;
      lastNameEnc: string;
      email: string;
    };
  };
}): CaregiverAssignmentResponse {
  const { firstName, lastName } = decryptUserNames(assignment.caregiver.user);
  return {
    caregiverId: assignment.caregiverId,
    childId: assignment.childId,
    firstName,
    lastName,
    email: assignment.caregiver.user.email,
    relationship: assignment.relationship,
    isLegalRepresentative: assignment.isLegalRepresentative,
  };
}

/**
 * Verifica que el usuario autenticado sea representante legal del niño (`isLegalRepresentative = true`).
 */
async function assertIsChildLegalRepresentative(
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

  throw HttpError.forbidden(
    'Solo el representante legal del niño puede gestionar los vínculos de cuidadores',
  );
}

/**
 * Verifica que el usuario autenticado pueda crear vínculos `atiende` sobre el niño:
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
 * Verifica que el usuario autenticado pueda finalizar un vínculo `atiende` sobre el niño:
 * debe ser su representante legal (`isLegalRepresentative = true`) o el propio profesional
 * titular del vínculo que se desea finalizar (`auth.userId === targetProfessionalId`) con vínculo vigente.
 */
async function assertCanEndProfessionalLink(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  childId: string,
  targetProfessionalId: string,
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

  if (auth.roles.includes('PROFESSIONAL') && auth.userId === targetProfessionalId) {
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
    'Solo el representante legal o el propio profesional asignado pueden finalizar este vínculo de atención',
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
        ...encryptChildNames({
          firstName: input.firstName,
          lastName: input.lastName,
        }),
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
    });

    return children
      .map(formatChildResponse)
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'es', { sensitivity: 'base' }) ||
          a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' }),
      );
  });
}

/**
 * Obtiene los datos mínimos de un niño por su ID. La autorización por vínculo se garantiza previamente en `requireLink`.
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
            user: { select: { firstNameEnc: true, lastNameEnc: true } },
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
            user: { select: { firstNameEnc: true, lastNameEnc: true } },
          },
        },
      },
    });

    return formatProfessionalAssignmentResponse(created);
  });
}

/**
 * Finaliza la asignación vigente de un profesional con un niño estableciendo `endDate`.
 * Solo permitido al representante legal del niño o al propio profesional titular del vínculo.
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
    await assertCanEndProfessionalLink(tx, auth, childId, professionalId);

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
            user: { select: { firstNameEnc: true, lastNameEnc: true } },
          },
        },
      },
    });

    return formatProfessionalAssignmentResponse(updated);
  });
}

/**
 * Lista los cuidadores vinculados (`cuida`) a un niño.
 */
export async function listChildCaregivers(
  auth: AuthContext,
  childId: string,
): Promise<CaregiverAssignmentResponse[]> {
  return withUser(auth.userId, async (tx) => {
    const links = await tx.caregiverChild.findMany({
      where: { childId },
      orderBy: [{ isLegalRepresentative: 'desc' }],
      include: {
        caregiver: {
          select: {
            user: {
              select: {
                firstNameEnc: true,
                lastNameEnc: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return links.map(formatCaregiverAssignmentResponse);
  });
}

/**
 * Vincula un cuidador adicional a un niño (`cuida`).
 * Solo permitido al representante legal del niño.
 */
export async function assignCaregiver(
  auth: AuthContext,
  childId: string,
  input: AssignCaregiverInput,
): Promise<CaregiverAssignmentResponse> {
  return withUser(auth.userId, async (tx) => {
    await assertIsChildLegalRepresentative(tx, auth, childId);

    const targetCaregiver = await tx.caregiver.findFirst({
      where: {
        ...(input.caregiverId ? { userId: input.caregiverId } : {}),
        ...(input.email ? { user: { email: input.email } } : {}),
      },
      select: {
        userId: true,
        user: { select: { status: true } },
      },
    });

    if (!targetCaregiver || targetCaregiver.user.status !== 'active') {
      throw HttpError.notFound('Cuidador no encontrado o inactivo');
    }

    const existingLink = await tx.caregiverChild.findUnique({
      where: {
        caregiverId_childId: {
          caregiverId: targetCaregiver.userId,
          childId,
        },
      },
      select: { caregiverId: true },
    });

    if (existingLink) {
      throw HttpError.conflict('El cuidador ya está vinculado a este niño');
    }

    const created = await tx.caregiverChild.create({
      data: {
        caregiverId: targetCaregiver.userId,
        childId,
        relationship: input.relationship,
        isLegalRepresentative: input.isLegalRepresentative,
      },
      include: {
        caregiver: {
          select: {
            user: {
              select: {
                firstNameEnc: true,
                lastNameEnc: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return formatCaregiverAssignmentResponse(created);
  });
}

/**
 * Actualiza el parentesco o condición de representante legal de un cuidador vinculado (`cuida`).
 * Solo permitido al representante legal del niño, garantizando que siempre quede al menos un representante legal.
 */
export async function updateCaregiverLink(
  auth: AuthContext,
  childId: string,
  caregiverId: string,
  input: UpdateCaregiverLinkInput,
): Promise<CaregiverAssignmentResponse> {
  return withUser(auth.userId, async (tx) => {
    await assertIsChildLegalRepresentative(tx, auth, childId);

    const existing = await tx.caregiverChild.findUnique({
      where: {
        caregiverId_childId: {
          caregiverId,
          childId,
        },
      },
    });

    if (!existing) {
      throw HttpError.notFound('No existe un vínculo con ese cuidador para este niño');
    }

    if (existing.isLegalRepresentative && input.isLegalRepresentative === false) {
      const legalRepCount = await tx.caregiverChild.count({
        where: { childId, isLegalRepresentative: true },
      });
      if (legalRepCount <= 1) {
        throw HttpError.conflict('El niño debe contar con al menos un representante legal');
      }
    }

    const updated = await tx.caregiverChild.update({
      where: {
        caregiverId_childId: {
          caregiverId,
          childId,
        },
      },
      data: {
        ...(input.relationship !== undefined ? { relationship: input.relationship } : {}),
        ...(input.isLegalRepresentative !== undefined
          ? { isLegalRepresentative: input.isLegalRepresentative }
          : {}),
      },
      include: {
        caregiver: {
          select: {
            user: {
              select: {
                firstNameEnc: true,
                lastNameEnc: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return formatCaregiverAssignmentResponse(updated);
  });
}

/**
 * Desvincula a un cuidador de un niño (`cuida`).
 * Solo permitido al representante legal del niño, impidiendo eliminar al único representante legal.
 */
export async function removeCaregiverLink(
  auth: AuthContext,
  childId: string,
  caregiverId: string,
): Promise<void> {
  return withUser(auth.userId, async (tx) => {
    await assertIsChildLegalRepresentative(tx, auth, childId);

    const existing = await tx.caregiverChild.findUnique({
      where: {
        caregiverId_childId: {
          caregiverId,
          childId,
        },
      },
    });

    if (!existing) {
      throw HttpError.notFound('No existe un vínculo con ese cuidador para este niño');
    }

    if (existing.isLegalRepresentative) {
      const legalRepCount = await tx.caregiverChild.count({
        where: { childId, isLegalRepresentative: true },
      });
      if (legalRepCount <= 1) {
        throw HttpError.conflict('No se puede desvincular al único representante legal del niño');
      }
    }

    await tx.caregiverChild.delete({
      where: {
        caregiverId_childId: {
          caregiverId,
          childId,
        },
      },
    });
  });
}

/**
 * Obtiene el consentimiento del niño:
 * Devuelve el consentimiento vigente (`revokedAt: null`), o en su defecto,
 * el más reciente registrado para trazabilidad.
 */
export async function getChildConsent(
  auth: AuthContext,
  childId: string,
): Promise<ConsentResponse> {
  return withUser(auth.userId, async (tx) => {
    const consent = await tx.consent.findFirst({
      where: { childId },
      orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { grantedAt: 'desc' }],
    });

    if (!consent) {
      throw HttpError.notFound('No existe registro de consentimiento informado para este niño');
    }

    return formatConsentResponse(consent);
  });
}

/**
 * Otorga consentimiento informado para un niño (restringido al representante legal).
 * Si ya existe uno vigente con diferente versión de texto, cierra el anterior (revocándolo)
 * y registra el nuevo en la misma transacción atómica.
 */
export async function grantConsent(
  auth: AuthContext,
  childId: string,
  input: GrantConsentInput,
): Promise<ConsentResponse> {
  return withUser(auth.userId, async (tx) => {
    await assertIsChildLegalRepresentative(tx, auth, childId);

    const activeConsent = await tx.consent.findFirst({
      where: { childId, revokedAt: null },
    });

    if (activeConsent) {
      if (activeConsent.textVersion === input.textVersion) {
        throw HttpError.conflict(
          'Ya existe un consentimiento informado vigente con esta versión del texto',
        );
      }
      // Revocar el consentimiento vigente anterior antes de crear la nueva versión
      await tx.consent.update({
        where: { id: activeConsent.id },
        data: { revokedAt: new Date() },
      });
    }

    const newConsent = await tx.consent.create({
      data: {
        id: crypto.randomUUID(),
        childId,
        caregiverId: auth.userId,
        textVersion: input.textVersion,
      },
    });

    return formatConsentResponse(newConsent);
  });
}

/**
 * Revoca el consentimiento informado vigente del niño (restringido al representante legal).
 * Realiza una revocación lógica (revokedAt = now()), preservando la fila para auditoría.
 */
export async function revokeConsent(auth: AuthContext, childId: string): Promise<ConsentResponse> {
  return withUser(auth.userId, async (tx) => {
    await assertIsChildLegalRepresentative(tx, auth, childId);

    const activeConsent = await tx.consent.findFirst({
      where: { childId, revokedAt: null },
    });

    if (!activeConsent) {
      throw HttpError.conflict('No existe un consentimiento informado vigente para revocar');
    }

    const updated = await tx.consent.update({
      where: { id: activeConsent.id },
      data: { revokedAt: new Date() },
    });

    return formatConsentResponse(updated);
  });
}

/**
 * Helper de servicio para validar que el niño tenga un consentimiento activo
 * antes de registrar mediciones o controles clínicos.
 */
export async function assertActiveConsent(
  tx: Prisma.TransactionClient,
  childId: string,
): Promise<void> {
  const active = await tx.consent.findFirst({
    where: { childId, revokedAt: null },
    select: { id: true },
  });

  if (!active) {
    throw HttpError.forbidden(
      'El niño no cuenta con un consentimiento informado vigente para registrar datos',
    );
  }
}
