import {
  ERASURE_LEGAL_DEADLINE_DAYS,
  isAgeInOmsRange,
  todayIsoDate,
  type ChildResponse,
  type ErasureRequestResponse,
  type ErasureRequestStatus,
  type RectifyChildInput,
} from '@nutrikids/shared';
import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { prisma, withUser } from '../lib/prisma.js';
import { formatChildResponse } from './children.service.js';
import { decryptUserNames, encryptChildFirstName, encryptChildLastName } from './pii.service.js';

/**
 * Derechos del representante sobre los datos del niño (NK-41, RF-20): rectificar, exportar y
 * solicitar la eliminación. Solo el representante legal; cada acción queda en auditoría
 * (middleware `auditHealth` en las rutas, y la función SQL en la ejecución).
 * Qué significa «eliminar»: docs/data-rights.md.
 */

const DAY_MS = 86_400_000;

async function assertLegalRepresentative(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  childId: string,
): Promise<void> {
  const link = auth.roles.includes('CAREGIVER')
    ? await tx.caregiverChild.findUnique({
        where: { caregiverId_childId: { caregiverId: auth.userId, childId } },
        select: { isLegalRepresentative: true },
      })
    : null;
  if (!link?.isLegalRepresentative) {
    throw HttpError.forbidden('Solo el representante legal del niño puede ejercer estos derechos');
  }
}

/**
 * Rectifica datos de identidad. Nombre y apellido se cambian siempre; fecha de nacimiento y
 * sexo solo si el niño aún no tiene controles, porque de ellos dependen todos los z-score ya
 * calculados (los controles son inmutables).
 */
export async function rectifyChild(
  auth: AuthContext,
  childId: string,
  input: RectifyChildInput,
): Promise<ChildResponse> {
  if (input.birthDate !== undefined) {
    if (input.birthDate > todayIsoDate()) {
      throw HttpError.badRequest('La fecha de nacimiento no puede ser futura');
    }
    if (!isAgeInOmsRange(input.birthDate)) {
      throw HttpError.badRequest('La edad del niño debe estar entre 12 y 60 meses');
    }
  }

  return withUser(auth.userId, async (tx) => {
    await assertLegalRepresentative(tx, auth, childId);

    if (input.birthDate !== undefined || input.sex !== undefined) {
      const checkups = await tx.checkup.count({ where: { childId } });
      if (checkups > 0) {
        throw HttpError.conflict(
          'La fecha de nacimiento y el sexo no se pueden cambiar porque el niño ya tiene controles registrados',
        );
      }
    }

    const data: Prisma.ChildUpdateInput = {};
    if (input.firstName !== undefined) data.firstNameEnc = encryptChildFirstName(input.firstName);
    if (input.lastName !== undefined) data.lastNameEnc = encryptChildLastName(input.lastName);
    if (input.birthDate !== undefined)
      data.birthDate = new Date(`${input.birthDate}T00:00:00.000Z`);
    if (input.sex !== undefined) data.sex = input.sex;

    return formatChildResponse(await tx.child.update({ where: { id: childId }, data }));
  });
}

/**
 * Soft-deletes the child: from then on RLS hides the child and all of its data from everybody
 * (rows stay in the database; permanent anonymisation is the erasure request below).
 */
export async function deleteChild(auth: AuthContext, childId: string): Promise<void> {
  await withUser(auth.userId, async (tx) => {
    await assertLegalRepresentative(tx, auth, childId);
    // SECURITY DEFINER function: RLS would reject an UPDATE whose new row is invisible.
    await tx.$executeRaw`SELECT soft_delete_child(${childId}::uuid)`;
  });
}

const exportInclude = {
  caregiverChildren: { include: { caregiver: { include: { user: true } } } },
  professionalChildren: { include: { professional: { include: { user: true } } } },
  consents: true,
  checkups: {
    orderBy: { measuredAt: 'asc' },
    include: {
      recordedBy: true,
      results: { include: { alerts: { include: { history: true } } } },
    },
  },
  feedingLogs: { orderBy: { logDate: 'asc' } },
  followUps: { orderBy: { id: 'asc' } },
  reminders: { orderBy: { scheduledFor: 'asc' } },
} as const satisfies Prisma.ChildInclude;

/**
 * Datos del niño en un solo documento descargable. De terceros (cuidadores y profesionales)
 * solo se incluye el nombre y el rol; nunca contraseñas, correos de profesionales ni licencias.
 */
export async function exportChildData(auth: AuthContext, childId: string) {
  return withUser(auth.userId, async (tx) => {
    await assertLegalRepresentative(tx, auth, childId);
    const child = await tx.child.findUnique({ where: { id: childId }, include: exportInclude });
    if (!child) throw HttpError.notFound('Niño no encontrado');

    const name = (u: { firstNameEnc: string; lastNameEnc: string }) => {
      const { firstName, lastName } = decryptUserNames(u);
      return `${firstName} ${lastName}`;
    };
    return {
      exportedAt: new Date().toISOString(),
      child: formatChildResponse(child),
      caregivers: child.caregiverChildren.map((c) => ({
        name: name(c.caregiver.user),
        email: c.caregiver.user.email,
        relationship: c.relationship,
        isLegalRepresentative: c.isLegalRepresentative,
      })),
      professionals: child.professionalChildren.map((p) => ({
        name: name(p.professional.user),
        specialty: p.professional.specialty,
        startDate: p.startDate.toISOString().slice(0, 10),
        endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
      })),
      consents: child.consents.map((c) => ({
        textVersion: c.textVersion,
        grantedAt: c.grantedAt.toISOString(),
        revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
      })),
      checkups: child.checkups.map((c) => ({
        id: c.id,
        measuredAt: c.measuredAt.toISOString(),
        weightKg: c.weightKg.toString(),
        lengthHeightCm: c.lengthHeightCm.toString(),
        position: c.position,
        origin: c.origin,
        correctedCheckupId: c.correctedCheckupId,
        notes: c.notes,
        recordedBy: name(c.recordedBy),
        results: c.results.map((r) => ({
          indicator: r.indicator,
          zScore: r.zScore.toString(),
          percentile: r.percentile.toString(),
          classification: r.classification,
          referenceVersion: r.referenceVersion,
          alerts: r.alerts.map((a) => ({
            id: a.id,
            riskType: a.riskType,
            isSevere: a.isSevere,
            status: a.status,
            createdAt: a.createdAt.toISOString(),
            history: a.history.map((h) => ({
              status: h.status,
              changedAt: h.changedAt.toISOString(),
            })),
          })),
        })),
      })),
      feedingLogs: child.feedingLogs.map((f) => ({
        logDate: f.logDate.toISOString().slice(0, 10),
        mealsPerDay: f.mealsPerDay,
        details: f.details,
      })),
      followUps: child.followUps.map((f) => ({
        id: f.id,
        type: f.type,
        details: f.details,
        nextCheckupDate: f.nextCheckupDate ? f.nextCheckupDate.toISOString().slice(0, 10) : null,
      })),
      reminders: child.reminders.map((r) => ({
        type: r.type,
        scheduledFor: r.scheduledFor.toISOString(),
        status: r.status,
      })),
    };
  });
}

function formatErasureRequest(
  row: Prisma.ErasureRequestGetPayload<object>,
): ErasureRequestResponse {
  return {
    id: row.id,
    childId: row.childId,
    status: row.status as ErasureRequestStatus,
    requestedAt: row.requestedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

/** Registra la solicitud (queda `pending` hasta su ejecución o cancelación). */
export async function createErasureRequest(
  auth: AuthContext,
  childId: string,
): Promise<ErasureRequestResponse> {
  return withUser(auth.userId, async (tx) => {
    await assertLegalRepresentative(tx, auth, childId);
    const pending = await tx.erasureRequest.findFirst({ where: { childId, status: 'pending' } });
    if (pending) {
      throw HttpError.conflict('Ya existe una solicitud de eliminación pendiente para este niño');
    }
    const now = Date.now();
    const created = await tx.erasureRequest.create({
      data: {
        childId,
        requestedById: auth.userId,
        status: 'pending',
        requestedAt: new Date(now),
        dueAt: new Date(now + ERASURE_LEGAL_DEADLINE_DAYS * DAY_MS),
      },
    });
    return formatErasureRequest(created);
  });
}

export async function listErasureRequests(
  auth: AuthContext,
  childId: string,
): Promise<ErasureRequestResponse[]> {
  return withUser(auth.userId, async (tx) => {
    await assertLegalRepresentative(tx, auth, childId);
    const rows = await tx.erasureRequest.findMany({
      where: { childId },
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map(formatErasureRequest);
  });
}

/** Cancela una solicitud pendiente (antes de que se ejecute). */
export async function cancelErasureRequest(
  auth: AuthContext,
  childId: string,
  requestId: string,
): Promise<ErasureRequestResponse> {
  return withUser(auth.userId, async (tx) => {
    await assertLegalRepresentative(tx, auth, childId);
    const existing = await tx.erasureRequest.findFirst({ where: { id: requestId, childId } });
    if (!existing) throw HttpError.notFound('Solicitud no encontrada');
    if (existing.status !== 'pending') {
      throw HttpError.conflict('La solicitud ya no está pendiente');
    }
    const updated = await tx.erasureRequest.update({
      where: { id: requestId },
      data: { status: 'cancelled', resolvedAt: new Date() },
    });
    return formatErasureRequest(updated);
  });
}

/** Ejecuta las solicitudes cuyo plazo de gracia venció (función SQL `execute_erasure_requests`). */
export async function runErasureRequests(): Promise<{ processed: number }> {
  const rows = await prisma.$queryRaw<Array<{ request_id: string }>>`
    SELECT request_id FROM execute_erasure_requests(${env.ERASURE_GRACE_DAYS}::int)
  `;
  return { processed: rows.length };
}
