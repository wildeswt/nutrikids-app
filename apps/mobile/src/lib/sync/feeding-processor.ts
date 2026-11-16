import {
  CreateFeedingLogInputSchema,
  UuidSchema,
  type CreateFeedingLogInput,
} from '@nutrikids/shared';
import { createChildFeedingLog, isFeedingNetworkError } from '../feeding-api.js';
import type { SyncFeedingPayload } from '../local-db/sync-queue-repository.js';
import {
  processSequentialQueue,
  type FlushQueueSummary,
  type SyncQueueProcessorContext,
} from './queue-processor.js';
import { isRetryableSyncError } from './sync-api.js';

/** Carga normalizada de un elemento `kind = 'feeding'` en `sync_queue`. */
export interface NormalizedFeedingQueuePayload {
  childId: string;
  input: CreateFeedingLogInput;
}

/**
 * Extrae y valida `{ childId, input }` desde el `payload` guardado en `sync_queue`.
 * Devuelve `null` si falta `childId` o el formato no corresponde a `CreateFeedingLogInput`.
 */
export function normalizeFeedingQueuePayload(
  payload: SyncFeedingPayload,
): NormalizedFeedingQueuePayload | null {
  if (!('childId' in payload)) {
    return null;
  }

  const parsedChildId = UuidSchema.safeParse(payload.childId);
  if (!parsedChildId.success) {
    return null;
  }

  const parsedInput = CreateFeedingLogInputSchema.safeParse({
    id: payload.id,
    logDate: payload.logDate,
    mealsPerDay: payload.mealsPerDay,
    ...(payload.details !== undefined ? { details: payload.details } : {}),
  });

  if (!parsedInput.success) {
    return null;
  }

  return {
    childId: parsedChildId.data,
    input: parsedInput.data,
  };
}

/**
 * Procesador de sincronización para elementos `kind = 'feeding'`.
 *
 * Envía los registros uno a uno mediante `POST /children/:childId/feeding-logs` (idempotente por `id`).
 * Un 4xx definitivo marca `'ERROR'` con el mensaje del servidor; red/5xx/408/429 aplican espera creciente.
 */
export async function processFeedingQueue(
  context: SyncQueueProcessorContext,
): Promise<FlushQueueSummary> {
  const sendFeeding = context.sendFeeding ?? createChildFeedingLog;

  return processSequentialQueue(context, {
    kind: 'feeding',
    normalize: normalizeFeedingQueuePayload,
    send: async (normalized) => {
      await sendFeeding(normalized.childId, normalized.input);
    },
    // `FeedingApiError` usa `status = 0` para fallos de red; `isRetryableSyncError` no lo marca
    // sin esta comprobación explícita.
    isRetryable: (error) => isFeedingNetworkError(error) || isRetryableSyncError(error),
  });
}
