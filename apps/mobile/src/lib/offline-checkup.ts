import {
  CaregiverCheckupResponseSchema,
  CreateCheckupInputSchema,
  SyncCheckupItemSchema,
  type CaregiverCheckupResponse,
  type CreateCheckupInput,
  type Position,
  type SyncCheckupItem,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { createChildCheckup } from './checkups-api.js';
import {
  checkupsRepository,
  childrenRepository,
  syncQueueRepository,
  type LocalDb,
  type SyncQueueRecord,
  type SyncQueueStatus,
} from './local-db/index.js';
import type { CaregiverCheckupListItem } from './offline-cache.js';
import {
  isNetworkUnavailableError,
  tryGetLocalDatabase,
  tryLocalOperation,
} from './offline-read.js';
import { syncEngine } from './sync/index.js';
import { generateUuid } from './uuid.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Resultado al crear un control, indicando `savedLocally: true` si se guardó solo localmente. */
export type CreateCheckupResult = CaregiverCheckupListItem & {
  savedLocally?: boolean;
};

/** Elemento mostrado en la pantalla «Pendientes de envío». */
export interface PendingSyncItem {
  id: string;
  childId: string;
  childName: string;
  status: SyncQueueStatus;
  measuredAt: string;
  weightKg: number;
  lengthHeightCm: number;
  position: Position;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

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

  const persistLocally = async (triggerSync: boolean): Promise<CreateCheckupResult> => {
    // Misma validación del esquema (incluidos valores atípicos `confirmOutlier`) que en línea.
    const syncItem = buildSyncCheckupItem(childId, attemptInput, () => attemptId);
    const db = userId ? await getDb('useCheckups.saveOffline') : null;
    if (!db || !userId) {
      throw new OfflineCheckupSaveError(i18n.t('errors:checkups.offlineNoLocalDb'));
    }

    const localCheckup = await saveCheckupLocallyInDb(db, userId, syncItem);

    if (triggerSync) {
      // Si se guardó con red disponible/recuperada, dispara un envío sin bloquear la UI.
      void syncNow().catch(() => {});
    } else {
      void refreshSyncState().catch(() => {});
    }

    return {
      ...localCheckup,
      savedLocally: true,
    };
  };

  if (!isOnline) {
    return persistLocally(false);
  }

  try {
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
  } catch (error) {
    // Los errores 4xx/5xx del servidor no caen a local; solo fallos de red / conectividad.
    if (!isNetworkUnavailableError(error)) {
      throw error;
    }
    return persistLocally(true);
  }
}

function toPendingSyncItem(
  record: SyncQueueRecord & { kind: 'checkup' },
  childNames: ReadonlyMap<string, string>,
): PendingSyncItem {
  const childName =
    childNames.get(record.payload.childId) ?? i18n.t('caregiver:pendingSync.childFallback');

  return {
    id: record.id,
    childId: record.payload.childId,
    childName,
    status: record.status,
    measuredAt: record.payload.measuredAt,
    weightKg: record.payload.weightKg,
    lengthHeightCm: record.payload.lengthHeightCm,
    position: record.payload.position,
    attempts: record.attempts,
    nextAttemptAt: record.nextAttemptAt,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Lista los controles del usuario en cola (`LOCAL`, `SENDING`, `ERROR`) más los `SENT` de
 * las últimas 24 horas, enriquecidos con el nombre del niño desde la caché local.
 */
export async function listPendingSyncCheckupItemsInDb(
  db: LocalDb,
  userId: string,
  nowMs: number = Date.now(),
): Promise<PendingSyncItem[]> {
  const sentSinceIso = new Date(nowMs - TWENTY_FOUR_HOURS_MS).toISOString();
  const [records, children] = await Promise.all([
    syncQueueRepository.listCheckupsWithRecentSent(db, userId, sentSinceIso),
    childrenRepository.list(db, userId),
  ]);

  const childNames = new Map<string, string>(children.map((child) => [child.id, child.firstName]));

  const items = records
    .filter((record): record is SyncQueueRecord & { kind: 'checkup' } => record.kind === 'checkup')
    .map((record) => toPendingSyncItem(record, childNames));

  // Muestra primero los controles por enviar o con error, y debajo los enviados recientes.
  return items.sort((a, b) => {
    const aSent = a.status === 'SENT' ? 1 : 0;
    const bSent = b.status === 'SENT' ? 1 : 0;
    if (aSent !== bSent) return aSent - bSent;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Lee los controles pendientes de `userId` usando la base SQLite local si está disponible. */
export async function listPendingSyncCheckupItems(
  userId: string | null,
  deps?: Pick<OfflineCheckupDependencies, 'getDb'>,
): Promise<PendingSyncItem[]> {
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
  await syncQueueRepository.updateStatus(db, userId, id, 'LOCAL', {
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
  });
}

/** Reintenta un control pendiente del usuario y dispara `syncEngine.syncNow()`. */
export async function retryOfflineCheckup(
  userId: string | null,
  id: string,
  deps?: Pick<OfflineCheckupDependencies, 'getDb' | 'syncNow'>,
): Promise<void> {
  if (!userId) return;
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const syncNow = deps?.syncNow ?? (() => syncEngine.syncNow());
  const db = await getDb('pendingSync.retry');
  if (!db) return;

  await retryOfflineCheckupInDb(db, userId, id);
  try {
    await syncNow();
  } catch {
    // El motor maneja errores internamente; evitamos romper la interacción de UI.
  }
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
  await db.withTransactionAsync(async () => {
    await syncQueueRepository.remove(db, userId, id);
    await checkupsRepository.deleteLocal(db, userId, id);
  });
}

/** Descarta un control pendiente del usuario y actualiza el estado del motor de sincronización. */
export async function discardOfflineCheckup(
  userId: string | null,
  id: string,
  deps?: Pick<OfflineCheckupDependencies, 'getDb' | 'refreshSyncState'>,
): Promise<void> {
  if (!userId) return;
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const refreshSyncState = deps?.refreshSyncState ?? (() => syncEngine.refreshState());
  const db = await getDb('pendingSync.discard');
  if (!db) return;

  await discardOfflineCheckupInDb(db, userId, id);
  try {
    await refreshSyncState();
  } catch {
    // Ignorado si no hay listeners activos.
  }
}
