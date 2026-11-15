import {
  SYNC_MAX_BATCH_SIZE,
  SyncCheckupsResponseSchema,
  type SyncCheckupResult,
  type SyncCheckupsResponse,
} from '@nutrikids/shared';
import i18n from '../../i18n/index.js';
import {
  checkupsRepository,
  syncQueueRepository,
  type SyncQueueRecord,
} from '../local-db/index.js';
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
import { isRetryableHttpStatus, isRetryableSyncError, postSyncCheckups } from './sync-api.js';

type CheckupQueueRecord = Extract<SyncQueueRecord, { kind: 'checkup' }>;

const DEFAULT_ITEM_ERROR = 'No se pudo sincronizar este control.';

function matchBatchResult(
  item: CheckupQueueRecord,
  index: number,
  results: readonly SyncCheckupResult[],
): SyncCheckupResult | undefined {
  const positional = results[index];
  if (positional && (positional.id === item.id || positional.id === null)) {
    return positional;
  }
  return results.find((entry) => entry.id === item.id);
}

/**
 * Procesador de sincronización para elementos `kind = 'checkup'`.
 * Envía los controles pendientes en lotes de hasta `SYNC_MAX_BATCH_SIZE`.
 */
export async function processCheckupQueue(
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
    post = postSyncCheckups,
  } = context;

  const dueItems = await listDueQueueItemsByKind(
    db,
    userId,
    'checkup',
    normalizedNow,
    ignoreSchedule,
  );
  const summary = createEmptyFlushSummary();

  if (dueItems.length === 0) {
    return summary;
  }

  for (let offset = 0; offset < dueItems.length; offset += SYNC_MAX_BATCH_SIZE) {
    const batch = dueItems.slice(offset, offset + SYNC_MAX_BATCH_SIZE);
    summary.batches += 1;
    summary.attempted += batch.length;

    await db.withTransactionAsync(async () => {
      for (const item of batch) {
        await syncQueueRepository.updateStatus(db, userId, item.id, 'SENDING');
      }
    });

    if (onProgress) {
      await onProgress();
    }

    let response: SyncCheckupsResponse;
    try {
      const rawResponse = await post(batch.map((item) => item.payload));
      response = SyncCheckupsResponseSchema.parse(rawResponse);
    } catch (error) {
      const readableError = getReadableSyncError(error);

      if (isRetryableSyncError(error)) {
        await db.withTransactionAsync(async () => {
          for (const item of batch) {
            const delayMs = computeBackoffMs(item.attempts, random);
            const nextAttemptAt = new Date(nowMs + delayMs).toISOString();
            await syncQueueRepository.updateStatus(db, userId, item.id, 'LOCAL', {
              attempts: item.attempts + 1,
              nextAttemptAt,
              lastError: readableError,
            });
          }
        });
        summary.deferredRetry += batch.length;
      } else if (isAuthExpiredSyncError(error)) {
        // Si la sesión expiró durante el envío, no se marcan como error definitivo del control.
        await db.withTransactionAsync(async () => {
          for (const item of batch) {
            await syncQueueRepository.updateStatus(db, userId, item.id, 'LOCAL');
          }
        });
        summary.deferredRetry += batch.length;
      } else {
        await db.withTransactionAsync(async () => {
          for (const item of batch) {
            await syncQueueRepository.updateStatus(db, userId, item.id, 'ERROR', {
              nextAttemptAt: null,
              lastError: readableError,
            });
          }
        });
        summary.failedPermanent += batch.length;
      }

      if (onProgress) {
        await onProgress();
      }
      break;
    }

    let syncedInBatch = 0;
    for (let i = 0; i < batch.length; i += 1) {
      const item = batch[i];
      if (!item) continue;

      const result = matchBatchResult(item, i, response.results);
      if (!result) {
        const delayMs = computeBackoffMs(item.attempts, random);
        await syncQueueRepository.updateStatus(db, userId, item.id, 'LOCAL', {
          attempts: item.attempts + 1,
          nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
          lastError: i18n.t('errors:invalidResponse'),
        });
        summary.deferredRetry += 1;
        continue;
      }

      if (result.status === 'CREATED' || result.status === 'DUPLICATE') {
        if (result.checkup) {
          await checkupsRepository.markSent(db, userId, item.payload.id, result.checkup);
        }
        await syncQueueRepository.updateStatus(db, userId, item.id, 'SENT', {
          nextAttemptAt: null,
          lastError: null,
        });
        syncedInBatch += 1;
        summary.synced += 1;
        continue;
      }

      const itemStatus = result.error?.status;
      const itemMessage = result.error?.message?.trim() || DEFAULT_ITEM_ERROR;

      if (typeof itemStatus === 'number' && isRetryableHttpStatus(itemStatus)) {
        const delayMs = computeBackoffMs(item.attempts, random);
        await syncQueueRepository.updateStatus(db, userId, item.id, 'LOCAL', {
          attempts: item.attempts + 1,
          nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
          lastError: itemMessage,
        });
        summary.deferredRetry += 1;
      } else {
        await syncQueueRepository.updateStatus(db, userId, item.id, 'ERROR', {
          nextAttemptAt: null,
          lastError: itemMessage,
        });
        summary.failedPermanent += 1;
      }
    }

    if (syncedInBatch > 0) {
      await recordSyncSuccessTimestamp(db, userId, normalizedNow);
    }

    if (onProgress) {
      await onProgress();
    }
  }

  return summary;
}
