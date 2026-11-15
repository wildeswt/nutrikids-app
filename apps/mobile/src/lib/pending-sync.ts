import type { Position } from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { normalizeFollowUpQueuePayload } from './follow-up-storage.js';
import {
  checkupsRepository,
  childrenRepository,
  syncQueueRepository,
  type LocalDb,
  type SyncQueueKind,
  type SyncQueueRecord,
  type SyncQueueStatus,
} from './local-db/index.js';
import { tryGetLocalDatabase, tryLocalOperation } from './offline-read.js';
import { syncEngine } from './sync/index.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface PendingSyncItemBase {
  id: string;
  childId: string;
  childName: string;
  status: SyncQueueStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Elemento de control antropométrico mostrado en «Pendientes de envío». */
export interface PendingSyncCheckupItem extends PendingSyncItemBase {
  kind?: 'checkup';
  measuredAt: string;
  weightKg: number;
  lengthHeightCm: number;
  position: Position;
}

/** Elemento de seguimiento clínico mostrado en «Pendientes de envío». */
export interface PendingSyncFollowUpItem extends PendingSyncItemBase {
  kind: 'follow-up';
  itemCount: number;
  nextCheckupDate: string | null;
}

/** Elemento de alimentación diaria mostrado en «Pendientes de envío». */
export interface PendingSyncFeedingItem extends PendingSyncItemBase {
  kind: 'feeding';
  logDate: string;
  mealsPerDay: number;
}

type PendingSyncCoreItem = PendingSyncCheckupItem | PendingSyncFollowUpItem;

/** Unión discriminada para todos los tipos en cola mostrados en «Pendientes de envío». */
export type PendingSyncItem = PendingSyncCoreItem | PendingSyncFeedingItem;

/** Dependencias inyectables para pruebas de lista, reintento y descarte de cola. */
export interface PendingSyncDependencies {
  getDb?: (operationName: string) => Promise<LocalDb | null>;
  syncNow?: () => Promise<void>;
  refreshSyncState?: () => Promise<unknown>;
}

function getFallbackChildName(): string {
  return i18n.t('caregiver:pendingSync.childFallback', 'Paciente');
}

function toPendingSyncItem(
  record: SyncQueueRecord,
  childNames: ReadonlyMap<string, string>,
): PendingSyncItem | null {
  const fallbackChildName = getFallbackChildName();
  const baseFields = {
    id: record.id,
    status: record.status,
    attempts: record.attempts,
    nextAttemptAt: record.nextAttemptAt,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (record.kind === 'checkup') {
    const childId = record.payload.childId;
    return {
      ...baseFields,
      kind: 'checkup',
      childId,
      childName: childNames.get(childId) ?? fallbackChildName,
      measuredAt: record.payload.measuredAt,
      weightKg: record.payload.weightKg,
      lengthHeightCm: record.payload.lengthHeightCm,
      position: record.payload.position,
    };
  }

  if (record.kind === 'follow-up') {
    const normalized = normalizeFollowUpQueuePayload(record.payload);
    const childId = normalized?.childId ?? '';
    return {
      ...baseFields,
      kind: 'follow-up',
      childId,
      childName: childNames.get(childId) ?? fallbackChildName,
      itemCount: normalized?.batch.items.length ?? 0,
      nextCheckupDate: normalized?.batch.nextCheckupDate ?? null,
    };
  }

  if (record.kind === 'feeding') {
    const childId = 'childId' in record.payload ? record.payload.childId : '';
    return {
      ...baseFields,
      kind: 'feeding',
      childId,
      childName: childNames.get(childId) ?? fallbackChildName,
      logDate: record.payload.logDate,
      mealsPerDay: record.payload.mealsPerDay,
    };
  }

  return null;
}

/**
 * Lista los elementos en cola (`LOCAL`, `SENDING`, `ERROR`) más los `SENT` de las últimas
 * 24 horas para todos los tipos (o filtrados por `kinds`), enriquecidos con el nombre local.
 */
export async function listPendingSyncItemsInDb(
  db: LocalDb,
  userId: string,
  nowMs: number = Date.now(),
  kinds?: readonly SyncQueueKind[],
): Promise<PendingSyncItem[]> {
  const sentSinceIso = new Date(nowMs - TWENTY_FOUR_HOURS_MS).toISOString();
  const [records, children] = await Promise.all([
    syncQueueRepository.listWithRecentSent(db, userId, sentSinceIso),
    childrenRepository.list(db, userId),
  ]);

  const childNames = new Map<string, string>();
  for (const child of children) {
    childNames.set(child.id, child.firstName);
  }
  const allowedKinds = kinds ? new Set<SyncQueueKind>(kinds) : null;

  const items: PendingSyncItem[] = [];
  for (const record of records) {
    if (allowedKinds && !allowedKinds.has(record.kind)) {
      continue;
    }
    const mapped = toPendingSyncItem(record, childNames);
    if (mapped) {
      items.push(mapped);
    }
  }

  // Muestra primero los elementos por enviar o con error, y debajo los enviados recientes.
  return items.sort((a, b) => {
    const aSent = a.status === 'SENT' ? 1 : 0;
    const bSent = b.status === 'SENT' ? 1 : 0;
    if (aSent !== bSent) return aSent - bSent;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Lee los pendientes de envío de todos los tipos usando la base SQLite local si existe. */
export async function listPendingSyncItems(
  userId: string | null,
  deps?: PendingSyncDependencies,
): Promise<PendingSyncItem[]> {
  if (!userId) return [];
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const db = await getDb('pendingSync.list');
  if (!db) return [];

  const loadItems = () => listPendingSyncItemsInDb(db, userId);
  return tryLocalOperation('pendingSync.list', loadItems, []);
}

/**
 * Reinicia cualquier elemento de `sync_queue` a `LOCAL` (`attempts = 0`, `next_attempt_at = null`,
 * `last_error = null`) para reintentar su envío de inmediato.
 */
export async function retryPendingSyncItemInDb(
  db: LocalDb,
  userId: string,
  itemId: string,
): Promise<void> {
  const resetFields = { attempts: 0, nextAttemptAt: null, lastError: null };
  await syncQueueRepository.updateStatus(db, userId, itemId, 'LOCAL', resetFields);
}

/** Reintenta cualquier elemento pendiente del usuario y dispara `syncEngine.syncNow()`. */
export async function retryPendingSyncItem(
  userId: string | null,
  id: string,
  deps?: PendingSyncDependencies,
): Promise<void> {
  if (!userId) return;
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const defaultSyncNow = () => syncEngine.syncNow();
  const syncNow = deps?.syncNow ?? defaultSyncNow;
  const db = await getDb('pendingSync.retry');
  if (!db) return;

  await retryPendingSyncItemInDb(db, userId, id);
  try {
    await syncNow();
  } catch {
    // El motor maneja errores internamente; evitamos romper la interacción de UI.
  }
}

/**
 * Descarta de forma atómica un elemento de `sync_queue`; si es de tipo `checkup`, también
 * elimina el control local `LOCAL` asociado en `checkups`.
 */
export async function discardPendingSyncItemInDb(
  db: LocalDb,
  userId: string,
  itemId: string,
): Promise<void> {
  const existing = await syncQueueRepository.getById(db, userId, itemId);

  await db.withTransactionAsync(async () => {
    await syncQueueRepository.remove(db, userId, itemId);
    if (!existing || existing.kind === 'checkup') {
      await checkupsRepository.deleteLocal(db, userId, itemId);
    }
  });
}

/** Descarta un elemento pendiente del usuario y actualiza el estado del motor de sincronización. */
export async function discardPendingSyncItem(
  userId: string | null,
  id: string,
  deps?: PendingSyncDependencies,
): Promise<void> {
  if (!userId) return;
  const getDb = deps?.getDb ?? tryGetLocalDatabase;
  const defaultRefresh = () => syncEngine.refreshState();
  const refreshSyncState = deps?.refreshSyncState ?? defaultRefresh;
  const db = await getDb('pendingSync.discard');
  if (!db) return;

  await discardPendingSyncItemInDb(db, userId, id);
  try {
    await refreshSyncState();
  } catch {
    // Ignorado si no hay listeners activos.
  }
}
