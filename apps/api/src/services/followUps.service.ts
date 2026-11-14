import {
  NEXT_CHECKUP_REMINDER_TYPE,
  type CreateFollowUpInput,
  type FollowUpResponse,
  type FollowUpType,
  type ReminderStatus,
} from '@nutrikids/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';

/**
 * Seguimientos clínicos (RF-15): observaciones, recomendaciones, intervenciones y derivaciones
 * de un profesional vinculado, opcionalmente ligadas a una alerta del niño. Si se indica el
 * próximo control, se crea su recordatorio en la misma transacción.
 */

/**
 * Hora (UTC) del recordatorio del próximo control: 13:00Z = 09:00 en America/Caracas (UTC−4,
 * sin horario de verano), la misma zona que usa la BD para las fechas de los controles.
 */
export const REMINDER_HOUR_UTC = 13;

export interface FollowUpWriteResult {
  followUp: FollowUpResponse;
  /** `true` si se creó en esta llamada; `false` si fue un reenvío idempotente. */
  created: boolean;
}

const followUpInclude = { reminder: true } as const satisfies Prisma.FollowUpInclude;

type FollowUpRow = Prisma.FollowUpGetPayload<{ include: typeof followUpInclude }>;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcToday(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/** Instante del recordatorio para una fecha de próximo control `AAAA-MM-DD`. */
export function reminderScheduledFor(nextCheckupDate: string): Date {
  const date = new Date(`${nextCheckupDate}T00:00:00.000Z`);
  date.setUTCHours(REMINDER_HOUR_UTC);
  return date;
}

function formatFollowUp(row: FollowUpRow): FollowUpResponse {
  return {
    id: row.id,
    childId: row.childId,
    alertId: row.alertId,
    professionalId: row.professionalId,
    type: row.type as FollowUpType,
    details: row.details,
    nextCheckupDate: row.nextCheckupDate ? toIsoDate(row.nextCheckupDate) : null,
    reminder: row.reminder
      ? {
          id: row.reminder.id,
          childId: row.reminder.childId,
          type: row.reminder.type,
          scheduledFor: row.reminder.scheduledFor.toISOString(),
          status: row.reminder.status as ReminderStatus,
        }
      : null,
  };
}

function mapFollowUpDbError(err: unknown): never {
  if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
    throw HttpError.conflict('Ya existe un seguimiento con ese identificador');
  }
  throw err;
}

/**
 * `requireLink` acepta también el vínculo de cuidador; un seguimiento clínico exige el
 * vínculo `atiende` vigente del profesional con el niño.
 */
async function assertActiveProfessionalLink(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  childId: string,
): Promise<void> {
  const today = utcToday();
  const link = auth.roles.includes('PROFESSIONAL')
    ? await tx.professionalChild.findFirst({
        where: {
          childId,
          professionalId: auth.userId,
          startDate: { lte: today },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { id: true },
      })
    : null;
  if (!link) {
    throw HttpError.forbidden(
      'Solo los profesionales vinculados al niño pueden registrar seguimientos',
    );
  }
}

/** La alerta debe existir (visible bajo RLS) y pertenecer al mismo niño. */
async function assertAlertBelongsToChild(
  tx: Prisma.TransactionClient,
  alertId: string,
  childId: string,
): Promise<void> {
  const alert = await tx.alert.findUnique({
    where: { id: alertId },
    select: { indicatorResult: { select: { checkup: { select: { childId: true } } } } },
  });
  if (!alert) {
    throw HttpError.notFound('Alerta no encontrada');
  }
  if (alert.indicatorResult.checkup.childId !== childId) {
    throw HttpError.badRequest('La alerta no pertenece a este niño');
  }
}

/**
 * Registra un seguimiento (RF-15). Idempotente por el `id` generado en el cliente: reenviar
 * el mismo id devuelve el seguimiento existente sin duplicar su recordatorio. No cambia el
 * estado de la alerta referenciada: eso se hace con `PATCH /alerts/:alertId/status`.
 */
export async function createFollowUp(
  auth: AuthContext,
  childId: string,
  input: CreateFollowUpInput,
): Promise<FollowUpWriteResult> {
  return withUser(auth.userId, async (tx) => {
    await assertActiveProfessionalLink(tx, auth, childId);

    const existing = await tx.followUp.findUnique({
      where: { id: input.id },
      include: followUpInclude,
    });
    if (existing) {
      if (existing.childId !== childId) {
        throw HttpError.conflict('Ya existe un seguimiento con ese identificador');
      }
      return { followUp: formatFollowUp(existing), created: false };
    }

    const nextCheckupDate = input.nextCheckupDate
      ? new Date(`${input.nextCheckupDate}T00:00:00.000Z`)
      : null;
    if (nextCheckupDate && nextCheckupDate < utcToday()) {
      throw HttpError.badRequest('La fecha del próximo control no puede estar en el pasado');
    }

    if (input.alertId) {
      await assertAlertBelongsToChild(tx, input.alertId, childId);
    }

    try {
      const created = await tx.followUp.create({
        data: {
          id: input.id,
          childId,
          alertId: input.alertId ?? null,
          professionalId: auth.userId,
          type: input.type,
          details: input.details,
          nextCheckupDate,
          ...(input.nextCheckupDate
            ? {
                reminder: {
                  create: {
                    childId,
                    type: NEXT_CHECKUP_REMINDER_TYPE,
                    scheduledFor: reminderScheduledFor(input.nextCheckupDate),
                    status: 'pending',
                  },
                },
              }
            : {}),
        },
        include: followUpInclude,
      });
      return { followUp: formatFollowUp(created), created: true };
    } catch (err) {
      return mapFollowUpDbError(err);
    }
  });
}
