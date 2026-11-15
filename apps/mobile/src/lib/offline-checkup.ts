import {
  CaregiverCheckupResponseSchema,
  CreateCheckupInputSchema,
  SyncCheckupItemSchema,
  type CaregiverCheckupResponse,
  type CreateCheckupInput,
  type SyncCheckupItem,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { createChildCheckup } from './checkups-api.js';
import { checkupsRepository, syncQueueRepository, type LocalDb } from './local-db/index.js';
import type { CaregiverCheckupListItem } from './offline-cache.js';
import {
  executeOfflineWriteFallback,
  isNetworkUnavailableError,
  tryGetLocalDatabase,
  tryLocalOperation,
} from './offline-read.js';
import {
  discardPendingSyncItem,
  discardPendingSyncItemInDb,
  listPendingSyncItemsInDb,
  retryPendingSyncItem,
  retryPendingSyncItemInDb,
  type PendingSyncCheckupItem,
} from './pending-sync.js';
import { syncEngine } from './sync/index.js';
import { generateUuid } from './uuid.js';

export type { PendingSyncCheckupItem, PendingSyncItem } from './pending-sync.js';

/** Resultado al crear un control, indicando `savedLocally: true` si se guardó solo localmente. */
export type CreateCheckupResult = CaregiverCheckupListItem & {
  savedLocally?: boolean;
};

/** Dependencias inyectables para pruebas unitarias de captura y cola sin conexión. */
export interface OfflineCheckupDependencies {
  createRemote?: (childId: string, input: CreateCheckupInput) => Promise<CaregiverCheckupResponse>;
  getDb?: (operationName: string) => Promise<LocalDb | null>;
  syncNow?: () => Promise<void>;
  refreshSyncState?: () => Promise<unknown>;
  generateId?: () => string;
}

/** Error lanzado cuando no hay conexión ni base local disponible para guardar el control. */
export class OfflineCheckupSaveError extends Error {
  constructor(message: string = i18n.t('errors:checkups.offlineNoLocalDb')) {
    super(message);
    this.name = 'OfflineCheckupSaveError';
  }
}

/**
 * Construye el payload `SyncCheckupItem` para encolar un control sin conexión.
 *
 * No calcula ni incluye `results`: el servidor siempre recalcula los indicadores OMS (RF-07)
 * y el cuidador nunca ve puntajes z, percentiles ni clasificaciones en la app (RF-14), por lo
 * que calcular resultados en el teléfono es innecesario.
 */
export function buildSyncCheckupItem(
  childId: string,
  input: CreateCheckupInput,
  generateId: () => string = generateUuid,
): SyncCheckupItem {
  const attemptId = input.id ?? generateId();
  const validatedInput = CreateCheckupInputSchema.parse({
    ...input,
    id: attemptId,
  });

  // Se excluye explícitamente `results` (RF-07 / RF-14): el servidor recalcula al sincronizar.
  const payload: SyncCheckupItem = {
    id: validatedInput.id ?? attemptId,
    childId,
    measuredAt: validatedInput.measuredAt,
    weightKg: validatedInput.weightKg,
    lengthHeightCm: validatedInput.lengthHeightCm,
    position: validatedInput.position,
    ...(validatedInput.notes !== undefined ? { notes: validatedInput.notes } : {}),
    ...(validatedInput.confirmOutlier !== undefined
      ? { confirmOutlier: validatedInput.confirmOutlier }
      : {}),
  };

  return SyncCheckupItemSchema.parse(payload);
}

function toLocalCaregiverCheckup(item: SyncCheckupItem, userId: string): CaregiverCheckupListItem {
  const candidate: CaregiverCheckupResponse = {
    id: item.id,
    childId: item.childId,
    measuredAt: item.measuredAt,
    weightKg: item.weightKg,
    lengthHeightCm: item.lengthHeightCm,
    position: item.position,
    origin: 'CAREGIVER',
    recordedById: userId,
    recordedBy: null,
    correctedCheckupId: null,
    isCurrent: true,
    notes: item.notes ?? null,
    createdAt: new Date().toISOString(),
  };
  return {
    ...CaregiverCheckupResponseSchema.parse(candidate),
    localOnly: true,
  };
}

/**
 * Guarda un control localmente (`LOCAL`) y lo encola (`kind = 'checkup'`) en UNA sola
 * transacción SQLite para evitar registros huérfanos sin tarea de envío o viceversa.
 */
export async function saveCheckupLocallyInDb(
  db: LocalDb,
  userId: string,
  item: SyncCheckupItem,
): Promise<CaregiverCheckupListItem> {
  const validated = SyncCheckupItemSchema.parse(item);

  await db.withTransactionAsync(async () => {
    await checkupsRepository.insertLocal(db, userId, validated);
    await syncQueueRepository.enqueue(db, userId, {
      id: validated.id,
      kind: 'checkup',
      payload: validated,
    });
  });

  return toLocalCaregiverCheckup(validated, userId);
}

/**
 * Crea un control en línea o cae de forma segura a guardado local atómico si el dispositivo
 * está sin conexión o si el envío falla por error de red (nunca ante errores 4xx).
 */
export async function createCheckupWithOfflineFallback(options: {
  userId: string | null;
  childId: string;
  input: CreateCheckupInput;
  isOnline: boolean;
  deps?: OfflineCheckupDependencies;
}): Promise<CreateCheckupResult> {
  const { userId, childId, input, isOnline, deps } = options;
  const createRemote = deps?.createRemote ?? createChildCheckup;
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const syncNow = deps?.syncNow ?? (() => syncEngine.syncNow());
  const refreshSyncState = deps?.refreshSyncState ?? (() => syncEngine.refreshState());
  const generateId = deps?.generateId ?? generateUuid;

  // Fijamos el mismo UUID antes del primer intento para conservar idempotencia si cae a local.
  const attemptId = input.id ?? generateId();
  const attemptInput: CreateCheckupInput = { ...input, id: attemptId };

  const persistLocally = async (): Promise<CreateCheckupResult> => {
    // Misma validación del esquema (incluidos valores atípicos `confirmOutlier`) que en línea.
    const syncItem = buildSyncCheckupItem(childId, attemptInput, () => attemptId);
    const db = userId ? await getDb('useCheckups.saveOffline') : null;
    if (!db || !userId) {
      throw new OfflineCheckupSaveError(i18n.t('errors:checkups.offlineNoLocalDb'));
    }

    const localCheckup = await saveCheckupLocallyInDb(db, userId, syncItem);
    return {
      ...localCheckup,
      savedLocally: true,
    };
  };

  return executeOfflineWriteFallback({
    isOnline,
    syncNow,
    refreshSyncState,
    isNetworkError: isNetworkUnavailableError,
    persistLocally,
    sendRemote: async () => {
      const checkup = await createRemote(childId, attemptInput);
      if (userId) {
        const db = await getDb('useCheckups.create');
        if (db) {
          await tryLocalOperation(
            'useCheckups.create',
            () => checkupsRepository.upsertMany(db, userId, [checkup]),
            undefined,
          );
        }
      }
      return checkup;
    },
  });
}

/**
 * Lista los controles del usuario en cola (`LOCAL`, `SENDING`, `ERROR`) más los `SENT` de
 * las últimas 24 horas, enriquecidos con el nombre del niño desde la caché local.
 */
export async function listPendingSyncCheckupItemsInDb(
  db: LocalDb,
  userId: string,
  nowMs: number = Date.now(),
): Promise<PendingSyncCheckupItem[]> {
  const items = await listPendingSyncItemsInDb(db, userId, nowMs, ['checkup']);
  return items as PendingSyncCheckupItem[];
}

/** Lee los controles pendientes de `userId` usando la base SQLite local si está disponible. */
export async function listPendingSyncCheckupItems(
  userId: string | null,
  deps?: Pick<OfflineCheckupDependencies, 'getDb'>,
): Promise<PendingSyncCheckupItem[]> {
  if (!userId) return [];
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const db = await getDb('pendingSync.list');
  if (!db) return [];

  return tryLocalOperation(
    'pendingSync.list',
    () => listPendingSyncCheckupItemsInDb(db, userId),
    [],
  );
}

/**
 * Reinicia un ítem en error a `LOCAL` (`attempts = 0`, `next_attempt_at = null`,
 * `last_error = null`) para reintentar su envío.
 */
export async function retryOfflineCheckupInDb(
  db: LocalDb,
  userId: string,
  id: string,
): Promise<void> {
  await retryPendingSyncItemInDb(db, userId, id);
}

/** Reintenta un control pendiente del usuario y dispara `syncEngine.syncNow()`. */
export async function retryOfflineCheckup(
  userId: string | null,
  id: string,
  deps?: Pick<OfflineCheckupDependencies, 'getDb' | 'syncNow'>,
): Promise<void> {
  await retryPendingSyncItem(userId, id, deps);
}

/**
 * Descarta de forma atómica un control pendiente eliminando su fila de `sync_queue`
 * y el registro `LOCAL` correspondiente en `checkups`.
 */
export async function discardOfflineCheckupInDb(
  db: LocalDb,
  userId: string,
  id: string,
): Promise<void> {
  await discardPendingSyncItemInDb(db, userId, id);
}

/** Descarta un control pendiente del usuario y actualiza el estado del motor de sincronización. */
export async function discardOfflineCheckup(
  userId: string | null,
  id: string,
  deps?: Pick<OfflineCheckupDependencies, 'getDb' | 'refreshSyncState'>,
): Promise<void> {
  await discardPendingSyncItem(userId, id, deps);
}
