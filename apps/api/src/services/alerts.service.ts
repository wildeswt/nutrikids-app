import crypto from 'node:crypto';
import {
  OPEN_ALERT_STATUSES,
  canProfessionalTransition,
  canTransition,
  type AlertDetailResponse,
  type AlertResponse,
  type AlertStatus,
  type Classification,
  type Indicator,
  type ListAlertsQuery,
  type Risk,
} from '@nutrikids/shared';
import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';
import { decryptUserNames } from './pii.service.js';

/**
 * Alertas de riesgo nutricional (NK-30, RF-11, RF-12, RF-17).
 *
 * - Generación: `createAlertsForResults`, llamada dentro de la transacción que registra el control.
 * - Máquina de estados: `updateAlertStatus` (transiciones en `ALERT_TRANSITIONS` de `@nutrikids/shared`).
 * - Bandeja: `listAlerts`, ordenada por riesgo y antigüedad.
 */

// ------------------------------------------------------
// Generación
// ------------------------------------------------------

export interface AlertRisk {
  riskType: Risk;
  isSevere: boolean;
}

const RISK_BY_CLASSIFICATION: Readonly<Partial<Record<Classification, AlertRisk>>> = {
  SEVERE_WASTING: { riskType: 'WASTING', isSevere: true },
  WASTING: { riskType: 'WASTING', isSevere: false },
  SEVERE_STUNTING: { riskType: 'STUNTING', isSevere: true },
  STUNTING: { riskType: 'STUNTING', isSevere: false },
  SEVERE_UNDERWEIGHT: { riskType: 'UNDERWEIGHT', isSevere: true },
  UNDERWEIGHT: { riskType: 'UNDERWEIGHT', isSevere: false },
  OBESITY: { riskType: 'OBESITY', isSevere: false },
  OVERWEIGHT: { riskType: 'OVERWEIGHT', isSevere: false },
};

/**
 * Condición de riesgo de un resultado. `NORMAL` y `OVERWEIGHT_RISK` no generan alerta.
 * Riesgo grave = cualquier z < −3 (P/T, T/E o P/E).
 */
export function riskFromClassification(classification: string): AlertRisk | null {
  return RISK_BY_CLASSIFICATION[classification as Classification] ?? null;
}

/**
 * Crea una alerta `GENERATED` (y su primera entrada en `alert_history`) por cada resultado
 * con condición de riesgo. Debe ejecutarse en la misma transacción que inserta los resultados.
 */
export async function createAlertsForResults(
  tx: Prisma.TransactionClient,
  results: readonly { id: string; classification: string }[],
  changedById: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const result of results) {
    const risk = riskFromClassification(result.classification);
    if (!risk) continue;
    const id = crypto.randomUUID();
    await tx.alert.create({
      data: {
        id,
        indicatorResultId: result.id,
        riskType: risk.riskType,
        isSevere: risk.isSevere,
        status: 'GENERATED',
        history: { create: { status: 'GENERATED', changedById } },
      },
    });
    ids.push(id);
  }
  return ids;
}

// ------------------------------------------------------
// Formato
// ------------------------------------------------------

const alertInclude = {
  indicatorResult: {
    include: {
      checkup: {
        select: { id: true, childId: true, corrections: { select: { id: true }, take: 1 } },
      },
    },
  },
} as const satisfies Prisma.AlertInclude;

type AlertRow = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

const INDICATOR_LABEL: Readonly<Record<Indicator, string>> = {
  WEIGHT_FOR_AGE: 'P/E',
  LENGTH_HEIGHT_FOR_AGE: 'T/E',
  WEIGHT_FOR_LENGTH_HEIGHT: 'P/T',
  BMI_FOR_AGE: 'IMC/E',
};

const CLASSIFICATION_LABEL: Readonly<Partial<Record<Classification, string>>> = {
  SEVERE_WASTING: 'Desnutrición aguda severa',
  WASTING: 'Desnutrición aguda',
  SEVERE_STUNTING: 'Talla baja severa',
  STUNTING: 'Talla baja',
  SEVERE_UNDERWEIGHT: 'Bajo peso severo',
  UNDERWEIGHT: 'Bajo peso',
  OBESITY: 'Obesidad',
  OVERWEIGHT: 'Sobrepeso',
};

export function alertReason(indicator: Indicator, classification: string, zScore: number): string {
  const label = CLASSIFICATION_LABEL[classification as Classification] ?? classification;
  return `${label}: ${INDICATOR_LABEL[indicator]} z = ${zScore.toFixed(2)}`;
}

/** Plazo para revisar una alerta (configurable, `ALERT_REVIEW_DEADLINE_*_HOURS`). */
export function reviewDeadlineHours(isSevere: boolean): number {
  return isSevere ? env.ALERT_REVIEW_DEADLINE_SEVERE_HOURS : env.ALERT_REVIEW_DEADLINE_HOURS;
}

function formatAlert(row: AlertRow, now: Date): AlertResponse {
  const result = row.indicatorResult;
  const zScore = Number(result.zScore);
  const reviewDueAt = new Date(
    row.createdAt.getTime() + reviewDeadlineHours(row.isSevere) * 3_600_000,
  );
  return {
    id: row.id,
    childId: result.checkup.childId,
    checkupId: result.checkup.id,
    indicatorResultId: result.id,
    indicator: result.indicator,
    zScore,
    classification: result.classification as Classification,
    riskType: row.riskType,
    isSevere: row.isSevere,
    reason: alertReason(result.indicator, result.classification, zScore),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    reviewDueAt: reviewDueAt.toISOString(),
    isOverdue: OPEN_ALERT_STATUSES.includes(row.status) && now > reviewDueAt,
    checkupIsCurrent: result.checkup.corrections.length === 0,
  };
}

// ------------------------------------------------------
// Bandeja
// ------------------------------------------------------

/** Prioridad de riesgo (menor = más urgente), según el orden de `RISK_CATEGORIES`. */
const RISK_PRIORITY: Readonly<Record<Risk, number>> = {
  WASTING: 0,
  STUNTING: 1,
  UNDERWEIGHT: 2,
  OBESITY: 3,
  OVERWEIGHT: 4,
};

/** Orden de la bandeja: grave primero, luego tipo de riesgo y, a igual riesgo, la más antigua. */
export function compareAlerts(
  a: Pick<AlertResponse, 'isSevere' | 'riskType' | 'createdAt'>,
  b: Pick<AlertResponse, 'isSevere' | 'riskType' | 'createdAt'>,
): number {
  if (a.isSevere !== b.isSevere) return a.isSevere ? -1 : 1;
  const byRisk = RISK_PRIORITY[a.riskType] - RISK_PRIORITY[b.riskType];
  if (byRisk !== 0) return byRisk;
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

function utcToday(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function activeProfessionalLinkWhere(professionalId: string): Prisma.ProfessionalChildWhereInput {
  const today = utcToday();
  return {
    professionalId,
    startDate: { lte: today },
    OR: [{ endDate: null }, { endDate: { gte: today } }],
  };
}

/**
 * Transición del sistema `GENERATED → PENDING_REVIEW` (Figura 3: «el sistema notifica al
 * profesional asignado»). Se ejecuta cuando la alerta le llega a un profesional vinculado:
 * hoy, al entregársela en la bandeja o en el detalle; NK-36 la llamará al enviar el push.
 * El historial registra como usuario al profesional notificado.
 */
export async function markAlertsNotified(
  tx: Prisma.TransactionClient,
  alertIds: readonly string[],
  professionalId: string,
): Promise<number> {
  let notified = 0;
  for (const id of alertIds) {
    // Condicionado a GENERATED: dos entregas simultáneas no duplican el historial.
    const { count } = await tx.alert.updateMany({
      where: { id, status: 'GENERATED' },
      data: { status: 'PENDING_REVIEW' },
    });
    if (count === 1) {
      await tx.alertHistory.create({
        data: { alertId: id, status: 'PENDING_REVIEW', changedById: professionalId },
      });
      notified += 1;
    }
  }
  return notified;
}

/**
 * Bandeja de alertas de los niños con vínculo `atiende` vigente del profesional. Las alertas
 * `GENERATED` se le notifican primero (pasan a `PENDING_REVIEW`), así que la bandeja de un
 * profesional nunca muestra alertas en `GENERATED`.
 */
export async function listAlerts(
  auth: AuthContext,
  query: ListAlertsQuery,
): Promise<AlertResponse[]> {
  const linkedChild: Prisma.IndicatorResultWhereInput = {
    checkup: {
      ...(query.childId ? { childId: query.childId } : {}),
      child: { professionalChildren: { some: activeProfessionalLinkWhere(auth.userId) } },
    },
  };
  const rows = await withUser(auth.userId, async (tx) => {
    const undelivered = await tx.alert.findMany({
      where: { status: 'GENERATED', indicatorResult: linkedChild },
      select: { id: true },
    });
    await markAlertsNotified(
      tx,
      undelivered.map((a) => a.id),
      auth.userId,
    );
    return tx.alert.findMany({
      where: {
        ...(query.status ? { status: { in: query.status } } : {}),
        indicatorResult: linkedChild,
      },
      include: alertInclude,
    });
  });
  const now = new Date();
  return rows.map((row) => formatAlert(row, now)).sort(compareAlerts);
}

// ------------------------------------------------------
// Detalle y máquina de estados
// ------------------------------------------------------

/**
 * Carga la alerta bajo RLS (404 si no existe o el usuario no tiene acceso al niño) y exige
 * que el usuario sea un profesional con vínculo vigente al niño (403 en caso contrario).
 */
async function loadAlertForProfessional(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  alertId: string,
): Promise<AlertRow> {
  const row = await tx.alert.findUnique({ where: { id: alertId }, include: alertInclude });
  if (!row) {
    throw HttpError.notFound('Alerta no encontrada');
  }
  const link = auth.roles.includes('PROFESSIONAL')
    ? await tx.professionalChild.findFirst({
        where: {
          childId: row.indicatorResult.checkup.childId,
          ...activeProfessionalLinkWhere(auth.userId),
        },
        select: { id: true },
      })
    : null;
  if (!link) {
    throw HttpError.forbidden(
      'Solo los profesionales vinculados al niño pueden gestionar la alerta',
    );
  }
  return row;
}

async function toDetail(tx: Prisma.TransactionClient, row: AlertRow): Promise<AlertDetailResponse> {
  const history = await tx.alertHistory.findMany({
    where: { alertId: row.id },
    orderBy: [{ changedAt: 'asc' }],
    include: { changedBy: { select: { firstNameEnc: true, lastNameEnc: true } } },
  });
  return {
    ...formatAlert(row, new Date()),
    history: history.map((h) => {
      const names = decryptUserNames({
        firstNameEnc: h.changedBy.firstNameEnc,
        lastNameEnc: h.changedBy.lastNameEnc,
      });
      return {
        status: h.status,
        changedById: h.changedById,
        changedByName: `${names.firstName} ${names.lastName}`,
        changedAt: h.changedAt.toISOString(),
      };
    }),
  };
}

export async function getAlert(auth: AuthContext, alertId: string): Promise<AlertDetailResponse> {
  return withUser(auth.userId, async (tx) => {
    const row = await loadAlertForProfessional(tx, auth, alertId);
    if (row.status === 'GENERATED' && (await markAlertsNotified(tx, [row.id], auth.userId))) {
      return toDetail(tx, { ...row, status: 'PENDING_REVIEW' });
    }
    return toDetail(tx, row);
  });
}

function mapAlertDbError(err: unknown): never {
  const message = err instanceof Error ? err.message : '';
  if (/needs a follow-up first/i.test(message)) {
    throw HttpError.conflict('Registra un seguimiento antes de marcar «seguimiento establecido»');
  }
  throw err;
}

/**
 * Cambio de estado pedido por un profesional vinculado (`REVIEWED`, `FOLLOW_UP_ESTABLISHED`),
 * según `ALERT_TRANSITIONS`. Cada cambio queda en
 * `alert_history` con el usuario y la hora. Pasar a `FOLLOW_UP_ESTABLISHED` exige un
 * registro en `follow_ups` para la alerta.
 */
export async function updateAlertStatus(
  auth: AuthContext,
  alertId: string,
  to: AlertStatus,
): Promise<AlertDetailResponse> {
  return withUser(auth.userId, async (tx) => {
    const row = await loadAlertForProfessional(tx, auth, alertId);
    const from = row.status;

    if (!canProfessionalTransition(from, to)) {
      throw HttpError.conflict(
        canTransition(from, to)
          ? `Transición de estado inválida: ${from} → ${to} la realiza el sistema al notificar al profesional`
          : `Transición de estado inválida: ${from} → ${to}`,
      );
    }

    if (to === 'FOLLOW_UP_ESTABLISHED') {
      const followUp = await tx.followUp.findFirst({ where: { alertId }, select: { id: true } });
      if (!followUp) {
        throw HttpError.conflict(
          'Registra un seguimiento antes de marcar «seguimiento establecido»',
        );
      }
    }

    try {
      // Condicionado al estado leído: si otro profesional lo cambió en paralelo, no se pisa.
      const { count } = await tx.alert.updateMany({
        where: { id: alertId, status: from },
        data: { status: to },
      });
      if (count === 0) {
        throw HttpError.conflict('La alerta cambió de estado; vuelve a cargarla');
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      mapAlertDbError(err);
    }

    await tx.alertHistory.create({
      data: { alertId, status: to, changedById: auth.userId },
    });

    return toDetail(tx, { ...row, status: to });
  });
}
