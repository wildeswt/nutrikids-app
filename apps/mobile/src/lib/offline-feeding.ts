import {
  CreateFeedingLogInputSchema,
  FeedingLogResponseSchema,
  UuidSchema,
  type CreateFeedingLogInput,
  type FeedingLogResponse,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { createChildFeedingLog, isFeedingNetworkError } from './feeding-api.js';
import {
  SyncFeedingPayloadSchema,
  syncQueueRepository,
  type LocalDb,
  type SyncFeedingWithChild,
} from './local-db/index.js';
import {
  executeOfflineWriteFallback,
  isNetworkUnavailableError,
  tryGetLocalDatabase,
} from './offline-read.js';
import { syncEngine } from './sync/index.js';
import { generateUuid } from './uuid.js';

/**
 * Resultado al guardar alimentación, indicando `savedLocally: true` si quedó en cola local.
 */
export type CreateFeedingResult = FeedingLogResponse & {
  savedLocally?: boolean;
};

/** Dependencias inyectables para pruebas unitarias de alimentación sin conexión. */
export interface OfflineFeedingDependencies {
  createRemote?: (childId: string, input: CreateFeedingLogInput) => Promise<FeedingLogResponse>;
  getDb?: (operationName: string) => Promise<LocalDb | null>;
  syncNow?: () => Promise<void>;
  refreshSyncState?: () => Promise<unknown>;
  generateId?: () => string;
}

/** Error lanzado cuando no hay conexión ni base local para encolar la alimentación. */
export class OfflineFeedingSaveError extends Error {
  constructor(message: string = i18n.t('errors:feeding.network')) {
    super(message);
    this.name = 'OfflineFeedingSaveError';
  }
}

/** Construye el payload normalizado `{ childId, ...input }` para encolar alimentación. */
export function buildSyncFeedingPayload(
  childId: string,
  input: CreateFeedingLogInput,
  generateId: () => string = generateUuid,
): SyncFeedingWithChild {
  const validChildId = UuidSchema.parse(childId);
  const attemptId = input.id ?? generateId();
  const validatedInput = CreateFeedingLogInputSchema.parse({
    ...input,
    id: attemptId,
  });

  return SyncFeedingPayloadSchema.parse({
    ...validatedInput,
    childId: validChildId,
  }) as SyncFeedingWithChild;
}

/**
 * Encola un registro de alimentación en `sync_queue` (`kind = 'feeding'`) dentro de una
 * transacción SQLite y devuelve la representación local del registro.
 */
export async function saveFeedingLocallyInDb(
  db: LocalDb,
  userId: string,
  childId: string,
  input: CreateFeedingLogInput,
): Promise<FeedingLogResponse> {
  const payload = buildSyncFeedingPayload(childId, input);

  await db.withTransactionAsync(async () => {
    await syncQueueRepository.enqueue(db, userId, {
      id: payload.id,
      kind: 'feeding',
      payload,
    });
  });

  return FeedingLogResponseSchema.parse({
    id: payload.id,
    childId: payload.childId,
    logDate: payload.logDate,
    mealsPerDay: payload.mealsPerDay,
    details: payload.details ?? null,
  });
}

/**
 * Envía el registro de alimentación en línea o cae a cola local `sync_queue` si está sin
 * conexión o falla por red (nunca ante respuestas HTTP 4xx/5xx), conservando el mismo `id`.
 */
export async function createFeedingWithOfflineFallback(options: {
  userId: string | null;
  childId: string;
  input: CreateFeedingLogInput;
  isOnline: boolean;
  deps?: OfflineFeedingDependencies;
}): Promise<CreateFeedingResult> {
  const { userId, childId, input, isOnline, deps } = options;
  const createRemote = deps?.createRemote ?? createChildFeedingLog;
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const syncNow = deps?.syncNow ?? (() => syncEngine.syncNow());
  const refreshSyncState = deps?.refreshSyncState ?? (() => syncEngine.refreshState());
  const generateId = deps?.generateId ?? generateUuid;

  // Fijamos el mismo UUID antes del primer intento para conservar idempotencia al reenviar.
  const attemptId = input.id ?? generateId();
  const attemptInput: CreateFeedingLogInput = { ...input, id: attemptId };

  return executeOfflineWriteFallback({
    isOnline,
    syncNow,
    refreshSyncState,
    isNetworkError: (error) => isFeedingNetworkError(error) || isNetworkUnavailableError(error),
    sendRemote: () => createRemote(childId, attemptInput),
    persistLocally: async () => {
      const db = userId ? await getDb('useFeedingLog.saveOffline') : null;
      if (!db || !userId) {
        throw new OfflineFeedingSaveError(i18n.t('errors:feeding.network'));
      }
      const localFeeding = await saveFeedingLocallyInDb(db, userId, childId, attemptInput);
      return {
        ...localFeeding,
        savedLocally: true,
      };
    },
  });
}
