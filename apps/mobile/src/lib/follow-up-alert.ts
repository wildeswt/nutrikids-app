import type { AlertStatus, CreateFollowUpBatchInput, FollowUpResponse } from '@nutrikids/shared';
import { fetchAlertDetail, updateAlertStatus } from './alerts-api.js';
import { FollowUpOfflineError, createFollowUpBatch } from './follow-ups-api.js';
import { getHttpStatus, isNetworkUnavailableError } from './offline-read.js';
import { isRetryableHttpStatus } from './sync/sync-api.js';

export interface FollowUpBatchRequest {
  childId: string;
  alertId?: string | undefined;
  establish: boolean;
  input: CreateFollowUpBatchInput;
}

export interface SentFollowUpBatchResult {
  kind: 'sent';
  followUps: FollowUpResponse[];
  alertStatus: AlertStatus | null;
  alertError?: string;
}

/**
 * Mueve la alerta a «seguimiento establecido». El seguimiento demuestra revisión clínica, así que
 * una alerta pendiente pasa primero por `REVIEWED` (la máquina de estados no permite saltos).
 */
export async function establishAlert(alertId: string): Promise<AlertStatus> {
  const alert = await fetchAlertDetail(alertId);
  let status = alert.status;
  if (status === 'FOLLOW_UP_ESTABLISHED') return status;
  if (status === 'PENDING_REVIEW') {
    status = (await updateAlertStatus(alertId, 'REVIEWED')).status;
  }
  if (status === 'REVIEWED') {
    status = (await updateAlertStatus(alertId, 'FOLLOW_UP_ESTABLISHED')).status;
  }
  return status;
}

function isRetryableAlertStepError(err: unknown): boolean {
  if (err instanceof FollowUpOfflineError || err instanceof TypeError) {
    return true;
  }
  if (isNetworkUnavailableError(err)) {
    return true;
  }
  const status = getHttpStatus(err);
  return status !== null && isRetryableHttpStatus(status);
}

/**
 * Envía un lote de seguimiento y, si corresponde, actualiza su alerta asociada.
 *
 * Reintentar con los mismos `id` es idempotente en el backend (responde 200 sin duplicar), por lo
 * que si falla la red o el servidor al actualizar la alerta se propaga `FollowUpOfflineError` para
 * conservar el elemento pendiente y reintentarlo luego.
 */
export async function sendFollowUpBatchAndAlert(
  submission: FollowUpBatchRequest,
): Promise<SentFollowUpBatchResult> {
  const followUps = await createFollowUpBatch(submission.childId, submission.input);
  if (!submission.establish || !submission.alertId) {
    return { kind: 'sent', followUps, alertStatus: null };
  }
  try {
    const alertStatus = await establishAlert(submission.alertId);
    return { kind: 'sent', followUps, alertStatus };
  } catch (err) {
    // Error transitorio o sin conexión al mover la alerta: reintentar todo el envío más tarde.
    if (isRetryableAlertStepError(err)) {
      throw new FollowUpOfflineError({ cause: err });
    }
    // Error definitivo de la alerta (por ejemplo transición concurrente): el lote ya se guardó.
    return {
      kind: 'sent',
      followUps,
      alertStatus: null,
      alertError: err instanceof Error ? err.message : String(err),
    };
  }
}
