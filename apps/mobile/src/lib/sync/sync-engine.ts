import { IsoDateTimeSchema } from '@nutrikids/shared';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getConnectivity,
  subscribeToConnectivity,
  type ConnectivityStatus,
} from '../connectivity.js';
import { createChildFeedingLog } from '../feeding-api.js';
import { sendFollowUpBatchAndAlert } from '../follow-up-alert.js';
import { migrateLegacyFollowUpStorage } from '../follow-up-migration.js';
import { metaRepository, type LocalDb, type SyncQueueKind } from '../local-db/index.js';
import { nowUtcIso, toUtcIso } from '../local-db/payload-codec.js';
import { tryGetLocalDatabase } from '../offline-read.js';
import { processCheckupQueue } from './checkup-processor.js';
import { processFeedingQueue } from './feeding-processor.js';
import { processFollowUpQueue } from './follow-up-processor.js';
import {
  createEmptyFlushSummary,
  mergeFlushSummaries,
  syncLastSyncedMetaKey,
  type FlushQueueSummary,
  type PostSyncCheckupsFn,
  type SendFeedingLogFn,
  type SendFollowUpBatchFn,
  type SyncQueueProcessor,
} from './queue-processor.js';
import { postSyncCheckups } from './sync-api.js';

export type {
  PostSyncCheckupsFn,
  SendFeedingLogFn,
  SendFollowUpBatchFn,
} from './queue-processor.js';

/** Mapa extensible de procesadores por tipo de elemento en `sync_queue`. */
export const SYNC_QUEUE_PROCESSORS: Partial<Record<SyncQueueKind, SyncQueueProcessor>> = {
  checkup: processCheckupQueue,
  'follow-up': processFollowUpQueue,
  feeding: processFeedingQueue,
};

const REGISTERED_PROCESSOR_KINDS = Object.keys(SYNC_QUEUE_PROCESSORS) as SyncQueueKind[];

/** Estado observable del motor de sincronización para la interfaz de usuario. */
export interface SyncState {
  pending: number;
  sending: number;
  error: number;
  lastSyncedAt: string | null;
}

/** Callback suscrito a los cambios de estado del motor de sincronización. */
export type SyncStateListener = (state: SyncState) => void;

/** Opciones de ejecución de un ciclo de vaciado de cola (`flushSyncQueue`). */
export interface FlushSyncQueueOptions {
  db: LocalDb;
  userId: string;
  now?: string;
  kinds?: readonly SyncQueueKind[];
  post?: PostSyncCheckupsFn;
  sendFollowUp?: SendFollowUpBatchFn;
  sendFeeding?: SendFeedingLogFn;
  ignoreSchedule?: boolean;
  random?: () => number;
  onProgress?: () => void | Promise<void>;
}

/** Opciones de ejecución de vaciado restringido a controles (`flushCheckupQueue`). */
export type FlushCheckupQueueOptions = Omit<
  FlushSyncQueueOptions,
  'kinds' | 'sendFollowUp' | 'sendFeeding'
>;

/** Opciones de ejecución de vaciado restringido a seguimientos (`flushFollowUpQueue`). */
export type FlushFollowUpQueueOptions = Omit<
  FlushSyncQueueOptions,
  'kinds' | 'post' | 'sendFeeding'
>;

/** Opciones de ejecución de vaciado restringido a alimentación (`flushFeedingQueue`). */
export type FlushFeedingQueueOptions = Omit<
  FlushSyncQueueOptions,
  'kinds' | 'post' | 'sendFollowUp'
>;

/** Resumen numérico del ciclo de sincronización ejecutado. */
export type FlushCheckupQueueResult = FlushQueueSummary;

/** Dependencias inyectables del motor de sincronización para facilitar pruebas unitarias. */
export interface SyncEngineDependencies {
  getDb?: () => Promise<LocalDb | null>;
  post?: PostSyncCheckupsFn;
  sendFollowUp?: SendFollowUpBatchFn;
  sendFeeding?: SendFeedingLogFn;
  migrateLegacyFollowUps?: (db: LocalDb, userId: string) => Promise<unknown>;
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

/** Mutex por instancia de base local y usuario para garantizar single-flight en `flushSyncQueue`. */
const inFlightFlushes = new WeakMap<LocalDb, Map<string, Promise<FlushQueueSummary>>>();

function defaultSubscribeToAppState(listener: (state: AppStateStatus) => void): () => void {
  if (typeof AppState?.addEventListener !== 'function') {
    return () => {};
  }
  const subscription = AppState.addEventListener('change', listener);
  return () => {
    subscription.remove();
  };
}

function isSameSyncState(a: SyncState, b: SyncState): boolean {
  return (
    a.pending === b.pending &&
    a.sending === b.sending &&
    a.error === b.error &&
    a.lastSyncedAt === b.lastSyncedAt
  );
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
 * Reinicia `next_attempt_at` de los elementos `'LOCAL'` pendientes de tipos registrados
 * al recuperar conectividad para procesarlos de inmediato.
 */
async function clearLocalRetryTimers(db: LocalDb, userId: string): Promise<void> {
  if (REGISTERED_PROCESSOR_KINDS.length === 0) {
    return;
  }
  const placeholders = REGISTERED_PROCESSOR_KINDS.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE sync_queue
     SET next_attempt_at = NULL, updated_at = ?
     WHERE user_id = ?
       AND kind IN (${placeholders})
       AND status = 'LOCAL'
       AND next_attempt_at IS NOT NULL;`,
    [nowUtcIso(), userId, ...REGISTERED_PROCESSOR_KINDS],
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
  if (REGISTERED_PROCESSOR_KINDS.length === 0) {
    return null;
  }
  const placeholders = REGISTERED_PROCESSOR_KINDS.map(() => '?').join(', ');
  const row = await db.getFirstAsync<{ next_at: string | null }>(
    `SELECT MIN(next_attempt_at) AS next_at
     FROM sync_queue
     WHERE user_id = ?
       AND kind IN (${placeholders})
       AND next_attempt_at IS NOT NULL
       AND status IN ('LOCAL', 'ERROR');`,
    [userId, ...REGISTERED_PROCESSOR_KINDS],
  );
  return row?.next_at ?? null;
}

async function executeFlushSyncQueue(options: FlushSyncQueueOptions): Promise<FlushQueueSummary> {
  const {
    db,
    userId,
    now = nowUtcIso(),
    kinds = REGISTERED_PROCESSOR_KINDS,
    post = postSyncCheckups,
    sendFollowUp = sendFollowUpBatchAndAlert,
    sendFeeding = createChildFeedingLog,
    ignoreSchedule = false,
    random = Math.random,
    onProgress,
  } = options;

  const normalizedNow = toUtcIso(IsoDateTimeSchema.parse(now));
  const nowMs = Date.parse(normalizedNow);
  const summary = createEmptyFlushSummary();

  for (const kind of kinds) {
    const processor = SYNC_QUEUE_PROCESSORS[kind];
    if (!processor) {
      continue;
    }

    const kindSummary = await processor({
      db,
      userId,
      normalizedNow,
      nowMs,
      ignoreSchedule,
      random,
      onProgress,
      post,
      sendFollowUp,
      sendFeeding,
    });
    mergeFlushSummaries(summary, kindSummary);
  }

  return summary;
}

/**
 * Ejecuta el vaciado de la cola general `sync_queue` despachando por cada tipo registrado.
 * Garantiza ejecución single-flight por base de datos y usuario.
 */
export async function flushSyncQueue(options: FlushSyncQueueOptions): Promise<FlushQueueSummary> {
  let byUser = inFlightFlushes.get(options.db);
  if (!byUser) {
    byUser = new Map<string, Promise<FlushQueueSummary>>();
    inFlightFlushes.set(options.db, byUser);
  }

  const existing = byUser.get(options.userId);
  if (existing) {
    return existing;
  }

  const promise = executeFlushSyncQueue(options).finally(() => {
    const currentMap = inFlightFlushes.get(options.db);
    if (currentMap?.get(options.userId) === promise) {
      currentMap.delete(options.userId);
    }
  });

  byUser.set(options.userId, promise);
  return promise;
}

/**
 * Envía en lotes (hasta `SYNC_MAX_BATCH_SIZE`) los controles pendientes del usuario hacia el servidor.
 * Garantiza ejecución single-flight por base de datos y usuario.
 */
export async function flushCheckupQueue(
  options: FlushCheckupQueueOptions,
): Promise<FlushCheckupQueueResult> {
  return flushSyncQueue({ ...options, kinds: ['checkup'] });
}

/**
 * Envía uno a uno los seguimientos clínicos pendientes del usuario en `sync_queue`.
 * Garantiza ejecución single-flight por base de datos y usuario.
 */
export async function flushFollowUpQueue(
  options: FlushFollowUpQueueOptions,
): Promise<FlushQueueSummary> {
  return flushSyncQueue({ ...options, kinds: ['follow-up'] });
}

/**
 * Envía uno a uno los registros de alimentación pendientes del usuario en `sync_queue`.
 * Garantiza ejecución single-flight por base de datos y usuario.
 */
export async function flushFeedingQueue(
  options: FlushFeedingQueueOptions,
): Promise<FlushQueueSummary> {
  return flushSyncQueue({ ...options, kinds: ['feeding'] });
}

/**
 * Motor reactivo de sincronización sin conexión:
 * - Migra datos heredados de seguimientos (SecureStore → SQLite) al iniciar.
 * - Recupera elementos `'SENDING'` interrumpidos al iniciar.
 * - Escucha conectividad (`NetInfo`), retorno al primer plano (`AppState`), botón manual (`syncNow`)
 *   y temporizador programado al siguiente `next_attempt_at`.
 * - Despacha cada tipo en `sync_queue` mediante `SYNC_QUEUE_PROCESSORS`.
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
      sendFollowUp: dependencies.sendFollowUp ?? sendFollowUpBatchAndAlert,
      sendFeeding: dependencies.sendFeeding ?? createChildFeedingLog,
      migrateLegacyFollowUps:
        dependencies.migrateLegacyFollowUps ??
        ((db, userId) => migrateLegacyFollowUpStorage(db, userId)),
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

  /** Inicia el motor para el usuario autenticado, migra cola antigua, recupera y sincroniza. */
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

      try {
        await this.deps.migrateLegacyFollowUps(db, userId);
      } catch {
        console.warn(
          '[sync-engine] Error de almacenamiento local en sync-engine.migrateLegacyFollowUps',
        );
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
        await flushSyncQueue({
          db,
          userId,
          now: new Date(this.deps.now()).toISOString(),
          post: this.deps.post,
          sendFollowUp: this.deps.sendFollowUp,
          sendFeeding: this.deps.sendFeeding,
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
