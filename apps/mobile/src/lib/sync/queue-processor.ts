import type {
  CreateFeedingLogInput,
  FeedingLogResponse,
  SyncCheckupItem,
  SyncCheckupsResponse,
} from '@nutrikids/shared';
import i18n from '../../i18n/index.js';
import type { FollowUpBatchRequest, SentFollowUpBatchResult } from '../follow-up-alert.js';
import { getHttpStatus } from '../offline-read.js';
import { metaRepository } from '../local-db/meta-repository.js';
import { syncQueueRepository, type SyncQueueRecord } from '../local-db/sync-queue-repository.js';
import type { LocalDb, SyncQueueKind } from '../local-db/types.js';
import { computeBackoffMs } from './backoff.js';
import { isRetryableSyncError } from './sync-api.js';

/** Firma de la función de transporte que envía un lote de controles al servidor. */
export type PostSyncCheckupsFn = (items: SyncCheckupItem[]) => Promise<SyncCheckupsResponse>;

export type SendFollowUpBatchFn = (
  request: FollowUpBatchRequest,
) => Promise<SentFollowUpBatchResult>;

/** Firma de la función de transporte que envía un registro de alimentación al servidor. */
export type SendFeedingLogFn = (
  childId: string,
  input: CreateFeedingLogInput,
) => Promise<FeedingLogResponse>;

/** Resumen agregado del procesamiento de la cola de sincronización. */
export interface FlushQueueSummary {
  attempted: number;
  synced: number;
  failedPermanent: number;
  deferredRetry: number;
  batches: number;
}

/** Dependencias y contexto compartidos por todos los procesadores por tipo. */
export interface SyncQueueProcessorContext {
  db: LocalDb;
  userId: string;
  normalizedNow: string;
  nowMs: number;
  ignoreSchedule: boolean;
  random: () => number;
  onProgress?: () => Promise<void> | void;
  post?: PostSyncCheckupsFn;
  sendFollowUp?: SendFollowUpBatchFn;
  sendFeeding?: SendFeedingLogFn;
}

/** Contrato genérico de un procesador especializado para un `kind` de `sync_queue`. */
export type SyncQueueProcessor = (context: SyncQueueProcessorContext) => Promise<FlushQueueSummary>;

export function createEmptyFlushSummary(): FlushQueueSummary {
  return {
    attempted: 0,
    synced: 0,
    failedPermanent: 0,
    deferredRetry: 0,
    batches: 0,
  };
}

export function mergeFlushSummaries(
  target: FlushQueueSummary,
  addition: FlushQueueSummary,
): FlushQueueSummary {
  target.attempted += addition.attempted;
  target.synced += addition.synced;
  target.failedPermanent += addition.failedPermanent;
  target.deferredRetry += addition.deferredRetry;
  target.batches += addition.batches;
  return target;
}

export function syncLastSyncedMetaKey(userId: string): string {
  return `sync:checkups:lastSyncedAt:${userId}`;
}

export function getReadableSyncError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return i18n.t('errors:requestFailed');
}

export function isAuthExpiredSyncError(error: unknown): boolean {
  return getHttpStatus(error) === 401;
}

export function sortQueueRecords<T extends SyncQueueRecord>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => {
    const aTime = a.nextAttemptAt ? Date.parse(a.nextAttemptAt) : Number.NEGATIVE_INFINITY;
    const bTime = b.nextAttemptAt ? Date.parse(b.nextAttemptAt) : Number.NEGATIVE_INFINITY;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    const createdCmp = a.createdAt.localeCompare(b.createdAt);
    if (createdCmp !== 0) {
      return createdCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Lista los elementos vencidos del tipo `kind`, incluyendo reintentos en `'LOCAL'` y errores
 * recuperables con `next_attempt_at` programado. Los `'ERROR'` sin `next_attempt_at` son 4xx
 * definitivos y nunca se reintentan automáticamente.
 */
export async function listDueQueueItemsByKind<K extends SyncQueueKind>(
  db: LocalDb,
  userId: string,
  kind: K,
  normalizedNow: string,
  ignoreSchedule: boolean,
): Promise<Array<Extract<SyncQueueRecord, { kind: K }>>> {
  const localRecords = ignoreSchedule
    ? await syncQueueRepository.listByKindAndStatuses(db, userId, kind, ['LOCAL'])
    : await syncQueueRepository.listDue(db, userId, normalizedNow);

  const errorRecords = await syncQueueRepository.listByKindAndStatuses(db, userId, kind, ['ERROR']);

  const dueById = new Map<string, Extract<SyncQueueRecord, { kind: K }>>();

  for (const record of localRecords) {
    if (record.kind === kind) {
      dueById.set(record.id, record as Extract<SyncQueueRecord, { kind: K }>);
    }
  }

  for (const record of errorRecords) {
    if (record.kind !== kind) continue;
    if (record.nextAttemptAt === null) continue;
    if (ignoreSchedule || record.nextAttemptAt <= normalizedNow) {
      dueById.set(record.id, record as Extract<SyncQueueRecord, { kind: K }>);
    }
  }

  return sortQueueRecords(Array.from(dueById.values()));
}

export async function recordSyncSuccessTimestamp(
  db: LocalDb,
  userId: string,
  normalizedNow: string,
): Promise<void> {
  await metaRepository.set(db, syncLastSyncedMetaKey(userId), normalizedNow);
}

/**
 * Procesa secuencialmente elementos de un `kind` en `sync_queue` uno por uno.
 * Un error transitorio (red, 5xx, 408, 429) programa espera creciente y detiene la tanda actual;
 * un 401 vuelve a `'LOCAL'` sin backoff; un 4xx definitivo pasa a `'ERROR'` sin reintento.
 */
export async function processSequentialQueue<K extends SyncQueueKind, TNormalized>(
  context: SyncQueueProcessorContext,
  options: {
    kind: K;
    normalize: (payload: Extract<SyncQueueRecord, { kind: K }>['payload']) => TNormalized | null;
    send: (normalized: TNormalized) => Promise<void>;
    isRetryable?: (error: unknown) => boolean;
  },
): Promise<FlushQueueSummary> {
  const { db, userId, normalizedNow, nowMs, ignoreSchedule, random, onProgress } = context;
  const dueItems = await listDueQueueItemsByKind(
    db,
    userId,
    options.kind,
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

    const normalizePayload = options.normalize as (payload: unknown) => TNormalized | null;
    const normalized = normalizePayload(item.payload);
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
      await options.send(normalized);

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
      const retryable = options.isRetryable
        ? options.isRetryable(error)
        : isRetryableSyncError(error);

      if (retryable) {
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
