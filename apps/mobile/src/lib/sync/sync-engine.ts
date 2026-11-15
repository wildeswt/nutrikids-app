import {
  IsoDateTimeSchema,
  SYNC_MAX_BATCH_SIZE,
  SyncCheckupsResponseSchema,
  type SyncCheckupItem,
  type SyncCheckupResult,
  type SyncCheckupsResponse,
} from '@nutrikids/shared';
import { AppState, type AppStateStatus } from 'react-native';
import i18n from '../../i18n/index.js';
import {
  getConnectivity,
  subscribeToConnectivity,
  type ConnectivityStatus,
} from '../connectivity.js';
import {
  checkupsRepository,
  metaRepository,
  syncQueueRepository,
  type LocalDb,
  type SyncQueueRecord,
} from '../local-db/index.js';
import { nowUtcIso, toUtcIso } from '../local-db/payload-codec.js';
import { getHttpStatus, tryGetLocalDatabase } from '../offline-read.js';
import { computeBackoffMs } from './backoff.js';
import { isRetryableHttpStatus, isRetryableSyncError, postSyncCheckups } from './sync-api.js';

type CheckupQueueRecord = Extract<SyncQueueRecord, { kind: 'checkup' }>;

/** Firma de la función de transporte que envía un lote de controles al servidor. */
export type PostSyncCheckupsFn = (items: SyncCheckupItem[]) => Promise<SyncCheckupsResponse>;

/** Estado observable del motor de sincronización para la interfaz de usuario. */
export interface SyncState {
  pending: number;
  sending: number;
  error: number;
  lastSyncedAt: string | null;
}

/** Callback suscrito a los cambios de estado del motor de sincronización. */
export type SyncStateListener = (state: SyncState) => void;

/** Opciones de ejecución de un ciclo de vaciado de cola (`flushCheckupQueue`). */
export interface FlushCheckupQueueOptions {
  db: LocalDb;
  userId: string;
  now?: string;
  post?: PostSyncCheckupsFn;
  ignoreSchedule?: boolean;
  random?: () => number;
  onProgress?: () => void | Promise<void>;
}

/** Resumen numérico del ciclo de sincronización ejecutado. */
export interface FlushCheckupQueueResult {
  attempted: number;
  synced: number;
  failedPermanent: number;
  deferredRetry: number;
  batches: number;
}

/** Dependencias inyectables del motor de sincronización para facilitar pruebas unitarias. */
export interface SyncEngineDependencies {
  getDb?: () => Promise<LocalDb | null>;
  post?: PostSyncCheckupsFn;
  getConnectivity?: () => Promise<ConnectivityStatus>;
  subscribeToConnectivity?: (listener: (status: ConnectivityStatus) => void) => () => void;
  subscribeToAppState?: (listener: (state: AppStateStatus) => void) => () => void;
  now?: () => number;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_SYNC_STATE: SyncState = {
  pending: 0,
  sending: 0,
  error: 0,
  lastSyncedAt: null,
};

const MAX_TIMEOUT_MS = 2_147_483_647;
const DEFAULT_ITEM_ERROR = 'No se pudo sincronizar este control.';

/** Mutex por instancia de base local y usuario para garantizar single-flight en `flushCheckupQueue`. */
const inFlightFlushes = new WeakMap<LocalDb, Map<string, Promise<FlushCheckupQueueResult>>>();

function syncLastSyncedMetaKey(userId: string): string {
  return `sync:checkups:lastSyncedAt:${userId}`;
}

function defaultSubscribeToAppState(listener: (state: AppStateStatus) => void): () => void {
  if (typeof AppState?.addEventListener !== 'function') {
    return () => {};
  }
  const subscription = AppState.addEventListener('change', listener);
  return () => {
    subscription.remove();
  };
}

function getReadableSyncError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return i18n.t('errors:requestFailed');
}

function isSameSyncState(a: SyncState, b: SyncState): boolean {
  return (
    a.pending === b.pending &&
    a.sending === b.sending &&
    a.error === b.error &&
    a.lastSyncedAt === b.lastSyncedAt
  );
}

function sortQueueRecords(records: readonly CheckupQueueRecord[]): CheckupQueueRecord[] {
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

async function listDueCheckupItems(
  db: LocalDb,
  userId: string,
  normalizedNow: string,
  ignoreSchedule: boolean,
): Promise<CheckupQueueRecord[]> {
  const localRecords = ignoreSchedule
    ? await syncQueueRepository.listByStatus(db, userId, 'LOCAL')
    : await syncQueueRepository.listDue(db, userId, normalizedNow);

  const errorRecords = await syncQueueRepository.listByStatus(db, userId, 'ERROR');

  const dueById = new Map<string, CheckupQueueRecord>();

  for (const record of localRecords) {
    if (record.kind === 'checkup') {
      dueById.set(record.id, record);
    }
  }

  for (const record of errorRecords) {
    if (record.kind !== 'checkup') continue;
    // Un ERROR sin `nextAttemptAt` es definitivo (4xx) y nunca se reintenta automáticamente.
    if (record.nextAttemptAt === null) continue;
    if (ignoreSchedule || record.nextAttemptAt <= normalizedNow) {
      dueById.set(record.id, record);
    }
  }

  return sortQueueRecords(Array.from(dueById.values()));
}

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
 * Restaura a `'LOCAL'` los elementos del usuario que quedaron en `'SENDING'`
 * tras un cierre inesperado de la aplicación.
 */
export async function recoverStuckSendingItems(db: LocalDb, userId: string): Promise<number> {
  const result = await db.runAsync(
    `UPDATE sync_queue
     SET status = 'LOCAL', updated_at = ?
     WHERE user_id = ? AND status = 'SENDING';`,
    [nowUtcIso(), userId],
  );
  return result.changes;
}

/**
 * Reinicia `next_attempt_at` de los controles `'LOCAL'` pendientes del usuario
 * al recuperar conectividad para procesarlos de inmediato.
 */
async function clearLocalRetryTimers(db: LocalDb, userId: string): Promise<void> {
  await db.runAsync(
    `UPDATE sync_queue
     SET next_attempt_at = NULL, updated_at = ?
     WHERE user_id = ? AND kind = 'checkup' AND status = 'LOCAL' AND next_attempt_at IS NOT NULL;`,
    [nowUtcIso(), userId],
  );
}

/**
 * Consulta los conteos actuales en `sync_queue` y la fecha de última sincronización del usuario.
 */
export async function readSyncStateFromDb(db: LocalDb, userId: string): Promise<SyncState> {
  const [rows, lastSyncedAt] = await Promise.all([
    db.getAllAsync<{ status: string; total: number }>(
      `SELECT status, COUNT(*) AS total
       FROM sync_queue
       WHERE user_id = ?
       GROUP BY status;`,
      [userId],
    ),
    metaRepository.get(db, syncLastSyncedMetaKey(userId)),
  ]);

  let pending = 0;
  let sending = 0;
  let error = 0;

  for (const row of rows) {
    const count = Number(row.total);
    if (row.status === 'LOCAL') pending = count;
    else if (row.status === 'SENDING') sending = count;
    else if (row.status === 'ERROR') error = count;
  }

  return { pending, sending, error, lastSyncedAt };
}

async function readEarliestRetryAt(db: LocalDb, userId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ next_at: string | null }>(
    `SELECT MIN(next_attempt_at) AS next_at
     FROM sync_queue
     WHERE user_id = ?
       AND kind = 'checkup'
       AND next_attempt_at IS NOT NULL
       AND status IN ('LOCAL', 'ERROR');`,
    [userId],
  );
  return row?.next_at ?? null;
}

async function executeFlushCheckupQueue(
  options: FlushCheckupQueueOptions,
): Promise<FlushCheckupQueueResult> {
  const {
    db,
    userId,
    now = nowUtcIso(),
    post = postSyncCheckups,
    ignoreSchedule = false,
    random = Math.random,
    onProgress,
  } = options;

  const normalizedNow = toUtcIso(IsoDateTimeSchema.parse(now));
  const nowMs = Date.parse(normalizedNow);

  const dueItems = await listDueCheckupItems(db, userId, normalizedNow, ignoreSchedule);
  const summary: FlushCheckupQueueResult = {
    attempted: 0,
    synced: 0,
    failedPermanent: 0,
    deferredRetry: 0,
    batches: 0,
  };

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
      } else if (getHttpStatus(error) === 401) {
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
      await metaRepository.set(db, syncLastSyncedMetaKey(userId), normalizedNow);
    }

    if (onProgress) {
      await onProgress();
    }
  }

  return summary;
}

/**
 * Envía en lotes (hasta `SYNC_MAX_BATCH_SIZE`) los controles pendientes del usuario hacia el servidor.
 * Garantiza ejecución single-flight por base de datos y usuario.
 */
export async function flushCheckupQueue(
  options: FlushCheckupQueueOptions,
): Promise<FlushCheckupQueueResult> {
  let byUser = inFlightFlushes.get(options.db);
  if (!byUser) {
    byUser = new Map<string, Promise<FlushCheckupQueueResult>>();
    inFlightFlushes.set(options.db, byUser);
  }

  const existing = byUser.get(options.userId);
  if (existing) {
    return existing;
  }

  const promise = executeFlushCheckupQueue(options).finally(() => {
    const currentMap = inFlightFlushes.get(options.db);
    if (currentMap?.get(options.userId) === promise) {
      currentMap.delete(options.userId);
    }
  });

  byUser.set(options.userId, promise);
  return promise;
}

/**
 * Motor reactivo de sincronización sin conexión:
 * - Recupera elementos `'SENDING'` interrumpidos al iniciar.
 * - Escucha conectividad (`NetInfo`), retorno al primer plano (`AppState`), botón manual (`syncNow`)
 *   y temporizador programado al siguiente `next_attempt_at`.
 * - Mantiene estado observable por usuario y degrada sin errores si SQLCipher no está disponible.
 */
export class SyncEngine {
  private readonly deps: Required<SyncEngineDependencies>;
  private readonly listeners = new Set<SyncStateListener>();

  private state: SyncState = DEFAULT_SYNC_STATE;
  private activeUserId: string | null = null;
  private generation = 0;
  private isOnline = true;
  private unsubscribeConnectivity: (() => void) | null = null;
  private unsubscribeAppState: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private startPromise: Promise<void> | null = null;
  private inFlightCycle: Promise<void> | null = null;
  private pendingManualResync = false;

  constructor(dependencies: SyncEngineDependencies = {}) {
    this.deps = {
      getDb: dependencies.getDb ?? (() => tryGetLocalDatabase('sync-engine')),
      post: dependencies.post ?? postSyncCheckups,
      getConnectivity: dependencies.getConnectivity ?? getConnectivity,
      subscribeToConnectivity: dependencies.subscribeToConnectivity ?? subscribeToConnectivity,
      subscribeToAppState: dependencies.subscribeToAppState ?? defaultSubscribeToAppState,
      now: dependencies.now ?? (() => Date.now()),
      random: dependencies.random ?? Math.random,
      setTimer: dependencies.setTimer ?? ((cb, ms) => setTimeout(cb, ms)),
      clearTimer: dependencies.clearTimer ?? ((timer) => clearTimeout(timer)),
    };
  }

  /** Devuelve la instantánea actual del estado de sincronización del usuario activo. */
  getSyncState = (): SyncState => {
    return this.state;
  };

  /** Suscribe un observador a los cambios del estado de sincronización. */
  subscribe = (listener: SyncStateListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Inicia el motor para el usuario autenticado, recupera interrupciones y sincroniza si hay red. */
  start = async (userId: string): Promise<void> => {
    if (this.activeUserId === userId) {
      if (this.startPromise) {
        await this.startPromise;
      }
      return;
    }

    if (this.activeUserId !== null) {
      this.stop();
    }

    this.activeUserId = userId;
    const myGeneration = ++this.generation;

    const promise = (async () => {
      const db = await this.getDbSafely();
      if (!db || myGeneration !== this.generation || this.activeUserId !== userId) {
        return;
      }

      try {
        await recoverStuckSendingItems(db, userId);
      } catch {
        console.warn('[sync-engine] Error de almacenamiento local en sync-engine.recover');
        return;
      }

      if (myGeneration !== this.generation || this.activeUserId !== userId) {
        return;
      }

      await this.refreshStateFromDb(db, userId, myGeneration);

      this.isOnline = (await this.checkConnectivitySafely()) === 'online';
      if (myGeneration !== this.generation || this.activeUserId !== userId) {
        return;
      }

      this.attachListeners(userId, myGeneration);

      if (this.isOnline) {
        await this.triggerFlush(false);
      }
    })().finally(() => {
      if (this.startPromise === promise) {
        this.startPromise = null;
      }
    });

    this.startPromise = promise;
    await promise;
  };

  /** Detiene suscripciones y temporizadores del motor al cerrar sesión. */
  stop = (): void => {
    this.generation += 1;
    this.activeUserId = null;
    this.startPromise = null;
    this.pendingManualResync = false;
    this.clearRetryTimer();

    if (this.unsubscribeConnectivity) {
      this.unsubscribeConnectivity();
      this.unsubscribeConnectivity = null;
    }

    if (this.unsubscribeAppState) {
      this.unsubscribeAppState();
      this.unsubscribeAppState = null;
    }

    this.setState(DEFAULT_SYNC_STATE);
  };

  /** Fuerza un intento manual inmediato ignorando el tiempo de espera (`next_attempt_at`). */
  syncNow = async (): Promise<void> => {
    const userId = this.activeUserId;
    if (!userId) {
      return;
    }

    const connectivity = await this.checkConnectivitySafely();
    this.isOnline = connectivity === 'online';

    if (!this.isOnline) {
      this.clearRetryTimer();
      await this.refreshState();
      return;
    }

    await this.triggerFlush(true);
  };

  /** Relee desde SQLite el estado de la cola del usuario activo y notifica si cambió. */
  refreshState = async (): Promise<SyncState> => {
    const userId = this.activeUserId;
    const myGeneration = this.generation;
    if (!userId) {
      return this.state;
    }

    const db = await this.getDbSafely();
    if (!db || myGeneration !== this.generation) {
      return this.state;
    }

    await this.refreshStateFromDb(db, userId, myGeneration);
    return this.state;
  };

  private attachListeners(userId: string, myGeneration: number): void {
    this.unsubscribeConnectivity = this.deps.subscribeToConnectivity((status) => {
      if (myGeneration !== this.generation || this.activeUserId !== userId) {
        return;
      }

      const wasOffline = !this.isOnline;
      this.isOnline = status === 'online';

      if (!this.isOnline) {
        this.clearRetryTimer();
        return;
      }

      void this.handleConnectivityRestored(userId, myGeneration, wasOffline);
    });

    this.unsubscribeAppState = this.deps.subscribeToAppState((nextAppState) => {
      if (myGeneration !== this.generation || this.activeUserId !== userId) {
        return;
      }
      if (nextAppState === 'active' && this.isOnline) {
        void this.triggerFlush(false);
      }
    });
  }

  private async handleConnectivityRestored(
    userId: string,
    myGeneration: number,
    wasOffline: boolean,
  ): Promise<void> {
    if (wasOffline) {
      const db = await this.getDbSafely();
      if (db && myGeneration === this.generation && this.activeUserId === userId) {
        try {
          await clearLocalRetryTimers(db, userId);
        } catch {
          console.warn('[sync-engine] Error de almacenamiento local en sync-engine.resetRetry');
        }
      }
    }

    if (myGeneration === this.generation && this.activeUserId === userId && this.isOnline) {
      await this.triggerFlush(false);
    }
  }

  private async triggerFlush(ignoreSchedule: boolean): Promise<void> {
    if (this.inFlightCycle) {
      if (ignoreSchedule) {
        this.pendingManualResync = true;
      }
      await this.inFlightCycle;
      return;
    }

    const cyclePromise = this.runCycle(ignoreSchedule).finally(() => {
      if (this.inFlightCycle === cyclePromise) {
        this.inFlightCycle = null;
      }
    });

    this.inFlightCycle = cyclePromise;
    await cyclePromise;
  }

  private async runCycle(initialIgnoreSchedule: boolean): Promise<void> {
    let ignoreSchedule = initialIgnoreSchedule;

    while (true) {
      const userId = this.activeUserId;
      const myGeneration = this.generation;
      if (!userId || !this.isOnline) {
        return;
      }

      const db = await this.getDbSafely();
      if (!db || myGeneration !== this.generation || this.activeUserId !== userId) {
        return;
      }

      this.clearRetryTimer();

      try {
        await flushCheckupQueue({
          db,
          userId,
          now: new Date(this.deps.now()).toISOString(),
          post: this.deps.post,
          ignoreSchedule,
          random: this.deps.random,
          onProgress: () => this.refreshStateFromDb(db, userId, myGeneration),
        });
      } catch {
        console.warn('[sync-engine] Error de almacenamiento local en sync-engine.flush');
      }

      if (myGeneration !== this.generation || this.activeUserId !== userId) {
        return;
      }

      await this.refreshStateFromDb(db, userId, myGeneration);

      if (this.pendingManualResync && this.isOnline) {
        this.pendingManualResync = false;
        ignoreSchedule = true;
        continue;
      }

      await this.scheduleNextRetryTimer(db, userId, myGeneration);
      return;
    }
  }

  private async scheduleNextRetryTimer(
    db: LocalDb,
    userId: string,
    myGeneration: number,
  ): Promise<void> {
    this.clearRetryTimer();

    if (!this.isOnline || myGeneration !== this.generation || this.activeUserId !== userId) {
      return;
    }

    let nextAt: string | null;
    try {
      nextAt = await readEarliestRetryAt(db, userId);
    } catch {
      console.warn('[sync-engine] Error de almacenamiento local en sync-engine.schedule');
      return;
    }

    if (
      !nextAt ||
      myGeneration !== this.generation ||
      this.activeUserId !== userId ||
      !this.isOnline
    ) {
      return;
    }

    const targetMs = Date.parse(nextAt);
    if (Number.isNaN(targetMs)) {
      return;
    }

    const delayMs = Math.min(MAX_TIMEOUT_MS, Math.max(0, targetMs - this.deps.now()));
    this.retryTimer = this.deps.setTimer(() => {
      this.retryTimer = null;
      if (myGeneration === this.generation && this.activeUserId === userId && this.isOnline) {
        void this.triggerFlush(false);
      }
    }, delayMs);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      this.deps.clearTimer(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async refreshStateFromDb(
    db: LocalDb,
    userId: string,
    myGeneration: number,
  ): Promise<void> {
    try {
      const nextState = await readSyncStateFromDb(db, userId);
      if (myGeneration === this.generation && this.activeUserId === userId) {
        this.setState(nextState);
      }
    } catch {
      console.warn('[sync-engine] Error de almacenamiento local en sync-engine.readState');
    }
  }

  private setState(nextState: SyncState): void {
    if (isSameSyncState(this.state, nextState)) {
      return;
    }
    this.state = nextState;
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // Ignorar errores individuales de suscriptores de UI.
      }
    }
  }

  private async getDbSafely(): Promise<LocalDb | null> {
    try {
      return await this.deps.getDb();
    } catch {
      console.warn('[sync-engine] Error de almacenamiento local en sync-engine.getDb');
      return null;
    }
  }

  private async checkConnectivitySafely(): Promise<ConnectivityStatus> {
    try {
      return await this.deps.getConnectivity();
    } catch {
      return 'offline';
    }
  }
}

/** Crea una instancia aislada del motor de sincronización (útil para pruebas). */
export function createSyncEngine(dependencies?: SyncEngineDependencies): SyncEngine {
  return new SyncEngine(dependencies);
}

/** Instancia compartida del motor de sincronización para toda la app móvil. */
export const syncEngine = new SyncEngine();
