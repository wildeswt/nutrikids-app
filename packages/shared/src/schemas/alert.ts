import { z } from 'zod';
import { ClassificationSchema } from './checkup.js';
import { IsoDateTimeSchema, UuidSchema } from './common.js';
import { AlertStatusSchema, IndicatorSchema, RiskSchema, type AlertStatus } from './enums.js';

/**
 * Alertas de riesgo nutricional y su máquina de estados (RF-11, RF-12, RF-17, NK-30).
 * Sigue la Figura 3 del informe:
 *
 * - `GENERATED`: nace cuando un resultado cumple una condición de riesgo. Ningún profesional
 *   la ha recibido todavía.
 * - `PENDING_REVIEW`: el **sistema** notificó al profesional asignado (la alerta le llegó).
 *   Pasado el plazo se le notifica de nuevo (NK-36), sin cambiar de estado.
 * - `REVIEWED`: el profesional abrió la alerta y la marcó como revisada. Desde aquí el
 *   cuidador recibe un mensaje no técnico (RF-14, NK-35).
 * - `FOLLOW_UP_ESTABLISHED`: el profesional registró el seguimiento (exige un registro en
 *   `follow_ups`). Estado final.
 *
 * Ninguna alerta se cierra sola, y cada cambio queda en `alert_history`.
 */

/** Transiciones válidas. Toda transición no listada es inválida. */
export const ALERT_TRANSITIONS: Readonly<Record<AlertStatus, readonly AlertStatus[]>> =
  Object.freeze({
    GENERATED: ['PENDING_REVIEW'],
    PENDING_REVIEW: ['REVIEWED'],
    REVIEWED: ['FOLLOW_UP_ESTABLISHED'],
    FOLLOW_UP_ESTABLISHED: [],
  });

export type AlertTransitionActor = 'SYSTEM' | 'PROFESSIONAL';

/** Quién lleva la alerta a cada estado: el sistema (al crearla o notificarla) o el profesional. */
export const ALERT_STATUS_SET_BY: Readonly<Record<AlertStatus, AlertTransitionActor>> =
  Object.freeze({
    GENERATED: 'SYSTEM',
    PENDING_REVIEW: 'SYSTEM',
    REVIEWED: 'PROFESSIONAL',
    FOLLOW_UP_ESTABLISHED: 'PROFESSIONAL',
  });

/** Estados «sin revisar», sujetos al plazo de revisión. */
export const OPEN_ALERT_STATUSES: readonly AlertStatus[] = ['GENERATED', 'PENDING_REVIEW'];

export function canTransition(from: AlertStatus, to: AlertStatus): boolean {
  return ALERT_TRANSITIONS[from].includes(to);
}

/** Transiciones que un profesional puede pedir con `PATCH /alerts/:alertId/status`. */
export function canProfessionalTransition(from: AlertStatus, to: AlertStatus): boolean {
  return canTransition(from, to) && ALERT_STATUS_SET_BY[to] === 'PROFESSIONAL';
}

// ---------- Entrada ----------

/** `PATCH /alerts/:alertId/status`. */
export const UpdateAlertStatusInputSchema = z.strictObject({
  status: AlertStatusSchema,
});

/** `GET /alerts?status=GENERATED,PENDING_REVIEW&childId=...` (bandeja del profesional). */
export const ListAlertsQuerySchema = z.object({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      v === undefined
        ? undefined
        : (Array.isArray(v) ? v : [v])
            .flatMap((s) => s.split(','))
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .pipe(z.array(AlertStatusSchema).min(1).optional()),
  childId: UuidSchema.optional(),
});

// ---------- Salida ----------

export const AlertHistoryEntrySchema = z.object({
  status: AlertStatusSchema,
  changedById: UuidSchema,
  /** Nombre de quien hizo el cambio, para mostrar el historial sin otra consulta. */
  changedByName: z.string(),
  changedAt: IsoDateTimeSchema,
});

export const AlertResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  checkupId: UuidSchema,
  indicatorResultId: UuidSchema,
  indicator: IndicatorSchema,
  /** Valor del indicador (puntaje z). */
  zScore: z.number(),
  classification: ClassificationSchema,
  riskType: RiskSchema,
  /** Riesgo grave (z < −3): sube la prioridad. */
  isSevere: z.boolean(),
  /** Motivo legible de la alerta. */
  reason: z.string(),
  status: AlertStatusSchema,
  createdAt: IsoDateTimeSchema,
  /** Fin del plazo para revisarla (creación + plazo configurado). */
  reviewDueAt: IsoDateTimeSchema,
  /** `true` si sigue sin revisar (GENERATED/PENDING_REVIEW) y venció el plazo. */
  isOverdue: z.boolean(),
  /** `false` si el control que la originó fue corregido (la alerta no se cierra sola). */
  checkupIsCurrent: z.boolean(),
});

export const AlertDetailResponseSchema = AlertResponseSchema.extend({
  history: z.array(AlertHistoryEntrySchema),
});

export type UpdateAlertStatusInput = z.infer<typeof UpdateAlertStatusInputSchema>;
export type ListAlertsQuery = z.infer<typeof ListAlertsQuerySchema>;
export type AlertHistoryEntry = z.infer<typeof AlertHistoryEntrySchema>;
export type AlertResponse = z.infer<typeof AlertResponseSchema>;
export type AlertDetailResponse = z.infer<typeof AlertDetailResponseSchema>;
