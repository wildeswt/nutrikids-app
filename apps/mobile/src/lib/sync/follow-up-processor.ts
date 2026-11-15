import i18n from '../../i18n/index.js';
import { sendFollowUpBatchAndAlert } from '../follow-up-alert.js';
import { normalizeFollowUpQueuePayload } from '../follow-up-storage.js';
import { syncQueueRepository } from '../local-db/sync-queue-repository.js';
import { computeBackoffMs } from './backoff.js';
import {
  createEmptyFlushSummary,
  getReadableSyncError,
  isAuthExpiredSyncError,
  listDueQueueItemsByKind,
  recordSyncSuccessTimestamp,
  type FlushQueueSummary,
  type SyncQueueProcessorContext,
} from './queue-processor.js';
import { isRetryableSyncError } from './sync-api.js';

/**
 * Procesador de sincronización para elementos `kind = 'follow-up'`.
 *
 * Envía los lotes uno a uno mediante `POST /children/:childId/follow-ups/batch` y, si aplica,
 * mueve la alerta asociada. Un fallo 4xx definitivo marca el elemento en `'ERROR'` sin reintento
 * automático; errores transitorios aplican espera creciente y detienen la tanda actual.
 */
export async function processFollowUpQueue(
  context: SyncQueueProcessorContext,
): Promise<FlushQueueSummary> {
  const {
    db,
    userId,
    normalizedNow,
    nowMs,
    ignoreSchedule,
    random,
    onProgress,
    sendFollowUp = sendFollowUpBatchAndAlert,
  } = context;

  const dueItems = await listDueQueueItemsByKind(
    db,
    userId,
    'follow-up',
    normalizedNow,
    ignoreSchedule,
  );
  const summary = createEmptyFlushSummary();

  if (dueItems.length === 0) {
    return summary;
  }

  for (const item of dueItems) {
    summary.batches += 1;
    summary.attempted += 1;

    const normalized = normalizeFollowUpQueuePayload(item.payload);
    if (!normalized) {
      await syncQueueRepository.updateStatus(db, userId, item.id, 'ERROR', {
        nextAttemptAt: null,
        lastError: i18n.t('errors:invalidResponse'),
      });
      summary.failedPermanent += 1;
      if (onProgress) {
        await onProgress();
      }
      continue;
    }

    await syncQueueRepository.updateStatus(db, userId, item.id, 'SENDING');
    if (onProgress) {
      await onProgress();
    }

    try {
      await sendFollowUp({
        childId: normalized.childId,
        ...(normalized.alertId ? { alertId: normalized.alertId } : {}),
        establish: normalized.establish,
        input: normalized.batch,
      });

      await syncQueueRepository.updateStatus(db, userId, item.id, 'SENT', {
        nextAttemptAt: null,
        lastError: null,
      });
      await recordSyncSuccessTimestamp(db, userId, normalizedNow);
      summary.synced += 1;

      if (onProgress) {
        await onProgress();
      }
    } catch (error) {
      const readableError = getReadableSyncError(error);

      if (isRetryableSyncError(error)) {
        const delayMs = computeBackoffMs(item.attempts, random);
        await syncQueueRepository.updateStatus(db, userId, item.id, 'LOCAL', {
          attempts: item.attempts + 1,
          nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
          lastError: readableError,
        });
        summary.deferredRetry += 1;

        if (onProgress) {
          await onProgress();
        }
        break;
      }

      if (isAuthExpiredSyncError(error)) {
        await syncQueueRepository.updateStatus(db, userId, item.id, 'LOCAL');
        summary.deferredRetry += 1;

        if (onProgress) {
          await onProgress();
        }
        break;
      }

      await syncQueueRepository.updateStatus(db, userId, item.id, 'ERROR', {
        nextAttemptAt: null,
        lastError: readableError,
      });
      summary.failedPermanent += 1;

      if (onProgress) {
        await onProgress();
      }
    }
  }

  return summary;
}
