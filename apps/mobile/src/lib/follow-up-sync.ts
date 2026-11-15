import type { AlertStatus, CreateFollowUpBatchInput, FollowUpResponse } from '@nutrikids/shared';
import { establishAlert, sendFollowUpBatchAndAlert } from './follow-up-alert.js';
import {
  addPending,
  batchToFormData,
  draftKey,
  enqueuePendingFollowUpInDb,
  listPending,
  listPendingFollowUpsInDb,
  removePending,
  saveDraft,
} from './follow-up-storage.js';
import { FollowUpApiError, FollowUpOfflineError } from './follow-ups-api.js';
import type { LocalDb } from './local-db/types.js';
import { tryGetLocalDatabase } from './offline-read.js';
import { flushFollowUpQueue, syncEngine, type SendFollowUpBatchFn } from './sync/index.js';

export { establishAlert };

export interface FollowUpSubmission {
  userId: string;
  childId: string;
  alertId?: string | undefined;
  establish: boolean;
  input: CreateFollowUpBatchInput;
}

export type SubmitResult =
  /** Guardado en el servidor. `alertError` se define si falló mover la alerta después. */
  | {
      kind: 'sent';
      followUps: FollowUpResponse[];
      alertStatus: AlertStatus | null;
      alertError?: string;
    }
  /** Sin conexión: guardado en el teléfono para enviarlo cuando vuelva el servicio. */
  | { kind: 'queued' };

export interface SubmitFollowUpOptions {
  /** Cuando es `false` se encola directamente sin intentar red. */
  isOnline?: boolean;
  db?: LocalDb | null;
}

export interface FlushResult {
  sent: number;
  /** Siguen esperando envío (sin conexión o en espera creciente). */
  remaining: number;
  /** Rechazados definitivamente (4xx) por el servidor. */
  rejected: number;
}

export interface FlushFollowUpOptions {
  db?: LocalDb | null;
  now?: string;
  sendFollowUp?: SendFollowUpBatchFn;
  ignoreSchedule?: boolean;
  random?: () => number;
}

/** Rechazo definitivo del servidor que no se resolverá reintentando (validación, permiso, conflicto). */
function isPermanent(err: unknown): err is FollowUpApiError {
  return (
    err instanceof FollowUpApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 408 &&
    err.status !== 429
  );
}

async function enqueueOfflineSubmission(
  submission: FollowUpSubmission,
  db: LocalDb | null,
): Promise<SubmitResult> {
  const entry = {
    userId: submission.userId,
    childId: submission.childId,
    ...(submission.alertId ? { alertId: submission.alertId } : {}),
    establish: submission.establish,
    input: submission.input,
  };

  if (db) {
    await enqueuePendingFollowUpInDb(db, entry);
    await syncEngine.refreshState();
    return { kind: 'queued' };
  }

  await addPending(entry);
  return { kind: 'queued' };
}

/**
 * Envía o encola un lote de seguimiento clínico.
 *
 * Con base local cifrada encola en `sync_queue` (tipo `'follow-up'`) y actualiza el estado del
 * motor de sincronización. Si no hay base local disponible, degrada al almacén en SecureStore.
 */
export async function submitFollowUp(
  submission: FollowUpSubmission,
  options?: SubmitFollowUpOptions,
): Promise<SubmitResult> {
  const db =
    options && 'db' in options ? (options.db ?? null) : await tryGetLocalDatabase('follow-up');

  if (options?.isOnline === false) {
    return enqueueOfflineSubmission(submission, db);
  }

  try {
    return await sendFollowUpBatchAndAlert(submission);
  } catch (err) {
    if (err instanceof FollowUpOfflineError) {
      return enqueueOfflineSubmission(submission, db);
    }
    throw err;
  }
}

async function flushLegacySecureStore(userId: string): Promise<FlushResult> {
  const pending = await listPending(userId);
  const result: FlushResult = { sent: 0, remaining: pending.length, rejected: 0 };

  for (const entry of pending) {
    const mainId = entry.input.items[0]?.id ?? entry.input.groupId ?? '';
    try {
      await sendFollowUpBatchAndAlert(entry);
      await removePending(mainId);
      result.sent += 1;
      result.remaining -= 1;
    } catch (err) {
      if (err instanceof FollowUpOfflineError) break;
      if (!isPermanent(err)) break;

      await saveDraft(draftKey(userId, entry), {
        userId,
        childId: entry.childId,
        alertId: entry.alertId,
        form: batchToFormData(entry.input, entry.establish),
        lastError: err.message,
      });
      await removePending(mainId);
      result.rejected += 1;
      result.remaining -= 1;
    }
  }

  return result;
}

/**
 * Envía los seguimientos pendientes del usuario. Cuando la base local está disponible delega al
 * procesador del motor general; sin base local conserva el flujo clásico en SecureStore.
 */
export async function flushPendingFollowUps(
  userId: string,
  options?: FlushFollowUpOptions,
): Promise<FlushResult> {
  const db =
    options && 'db' in options ? (options.db ?? null) : await tryGetLocalDatabase('follow-up');
  if (!db) {
    return flushLegacySecureStore(userId);
  }

  const summary = await flushFollowUpQueue({
    db,
    userId,
    now: options?.now,
    sendFollowUp: options?.sendFollowUp,
    ignoreSchedule: options?.ignoreSchedule ?? true,
    random: options?.random,
  });

  const remaining = await listPendingFollowUpsInDb(db, userId);
  await syncEngine.refreshState();

  return {
    sent: summary.synced,
    remaining: remaining.length,
    rejected: summary.failedPermanent,
  };
}
