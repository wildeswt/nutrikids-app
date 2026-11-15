import type { SyncCheckupItem, SyncCheckupsResponse } from '@nutrikids/shared';
import i18n from '../../i18n/index.js';
import type { FollowUpBatchRequest, SentFollowUpBatchResult } from '../follow-up-alert.js';
import { getHttpStatus } from '../offline-read.js';
import { metaRepository } from '../local-db/meta-repository.js';
import { syncQueueRepository, type SyncQueueRecord } from '../local-db/sync-queue-repository.js';
import type { LocalDb, SyncQueueKind } from '../local-db/types.js';

/** Firma de la función de transporte que envía un lote de controles al servidor. */
export type PostSyncCheckupsFn = (items: SyncCheckupItem[]) => Promise<SyncCheckupsResponse>;

export type SendFollowUpBatchFn = (
  request: FollowUpBatchRequest,
) => Promise<SentFollowUpBatchResult>;

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
