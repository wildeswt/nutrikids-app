import * as SecureStore from 'expo-secure-store';
import {
  clearAllLegacyFollowUpData,
  clearLegacyUserFollowUpData,
  countLegacyPendingFollowUps,
} from './follow-up-storage.js';
import type { LocalDb } from './local-db/index.js';
import { wipeLocalData } from './local-db/wipe.js';
import { tryGetLocalDatabase } from './offline-read.js';
import { clearReferralDraft } from './referral-form.js';
import { readSyncStateFromDb, syncEngine } from './sync/sync-engine.js';

/** Clave en almacenamiento seguro para reintentar un borrado fallido al próximo inicio. */
export const PENDING_WIPE_STORAGE_KEY = 'nutrikids.localDb.pendingWipe';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const memoryMarkerStorage = new Map<string, string>();

/** Dependencias inyectables para pruebas unitarias y control de ciclo de vida. */
export interface LocalWipeDependencies {
  stopAndWaitSync?: () => Promise<void>;
  wipeDatabase?: () => Promise<void>;
  clearUserFollowUpData?: (userId: string) => Promise<void>;
  clearAllFollowUpData?: () => Promise<void>;
  clearUserReferralDraft?: (userId: string) => Promise<void>;
  getLocalDb?: () => Promise<LocalDb | null>;
  countLegacyPending?: (userId: string) => Promise<number>;
  hasPendingWipeMarker?: () => Promise<boolean>;
  setPendingWipeMarker?: () => Promise<void>;
  clearPendingWipeMarker?: () => Promise<void>;
  onOperationError?: (operation: string) => void;
}

export interface WipeUserLocalStorageOptions {
  userId?: string | null;
  deps?: LocalWipeDependencies;
}

export interface WipeUserLocalStorageResult {
  succeeded: boolean;
  failedOperations: string[];
}

export interface SessionExpiredCleanupResult {
  hadUnsentRecords: boolean;
  wiped: boolean;
}

let wipeOperationQueue: Promise<unknown> = Promise.resolve();

function serializeWipeTask<T>(task: () => Promise<T>): Promise<T> {
  const next = wipeOperationQueue.then(task, task);
  wipeOperationQueue = next.catch(() => undefined);
  return next;
}

async function hasSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function readPendingWipeMarker(): Promise<boolean> {
  try {
    if (await hasSecureStore()) {
      const value = await SecureStore.getItemAsync(PENDING_WIPE_STORAGE_KEY, SECURE_STORE_OPTIONS);
      return value !== null;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(PENDING_WIPE_STORAGE_KEY) !== null;
    }
    return memoryMarkerStorage.has(PENDING_WIPE_STORAGE_KEY);
  } catch {
    return memoryMarkerStorage.has(PENDING_WIPE_STORAGE_KEY);
  }
}

async function writePendingWipeMarker(): Promise<void> {
  try {
    if (await hasSecureStore()) {
      await SecureStore.setItemAsync(PENDING_WIPE_STORAGE_KEY, '1', SECURE_STORE_OPTIONS);
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PENDING_WIPE_STORAGE_KEY, '1');
      return;
    }
  } catch {
    // Si el almacenamiento seguro falla, se conserva respaldo en memoria durante el proceso.
  }
  memoryMarkerStorage.set(PENDING_WIPE_STORAGE_KEY, '1');
}

async function removePendingWipeMarker(): Promise<void> {
  memoryMarkerStorage.delete(PENDING_WIPE_STORAGE_KEY);
  try {
    if (await hasSecureStore()) {
      await SecureStore.deleteItemAsync(PENDING_WIPE_STORAGE_KEY, SECURE_STORE_OPTIONS);
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(PENDING_WIPE_STORAGE_KEY);
    }
  } catch {
    // Se tolera un fallo al limpiar la marca residual si el almacén seguro no está disponible.
  }
}

function defaultLogOperationError(operation: string): void {
  console.warn(`[local-wipe] Fallo al ejecutar ${operation}`);
}

/**
 * Indica si existen registros sin enviar (`LOCAL`, `SENDING` o `ERROR`) en la cola local
 * o en el respaldo antiguo de SecureStore para el usuario indicado.
 */
export async function hasUnsentSyncRecords(
  userId: string | null,
  deps: LocalWipeDependencies = {},
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const countLegacyPending = deps.countLegacyPending ?? countLegacyPendingFollowUps;
  try {
    const legacyCount = await countLegacyPending(userId);
    if (legacyCount > 0) {
      return true;
    }
  } catch {
    // Si el respaldo heredado no es legible se continúa con SQLite.
  }

  const getLocalDb = deps.getLocalDb ?? (() => tryGetLocalDatabase('local-wipe.checkUnsent'));
  try {
    const db = await getLocalDb();
    if (!db) {
      return false;
    }
    const syncState = await readSyncStateFromDb(db, userId);
    return syncState.pending + syncState.sending + syncState.error > 0;
  } catch {
    // Si no se pudo verificar la cola, se asume que hay pendientes: conservar es la opción
    // segura, porque borrar trabajo clínico sin comprobarlo no se puede deshacer.
    return true;
  }
}

/**
 * Detiene el motor de sincronización esperando ciclos en curso y borra la base cifrada,
 * su clave de cifrado y los datos residuales del usuario en SecureStore/borradores.
 * Nunca lanza excepciones para no bloquear el cierre de sesión: ante un fallo registra
 * solo el nombre de la operación y guarda una marca para reintentar al próximo inicio.
 */
export function wipeUserLocalStorage(
  options: WipeUserLocalStorageOptions = {},
): Promise<WipeUserLocalStorageResult> {
  const { userId = null, deps = {} } = options;

  return serializeWipeTask(async () => {
    const stopAndWaitSync = deps.stopAndWaitSync ?? syncEngine.stopAndWait;
    const wipeDatabase = deps.wipeDatabase ?? wipeLocalData;
    const clearUserFollowUpData = deps.clearUserFollowUpData ?? clearLegacyUserFollowUpData;
    const clearAllFollowUpData = deps.clearAllFollowUpData ?? clearAllLegacyFollowUpData;
    const clearUserReferralDraft = deps.clearUserReferralDraft ?? clearReferralDraft;
    const setMarker = deps.setPendingWipeMarker ?? writePendingWipeMarker;
    const clearMarker = deps.clearPendingWipeMarker ?? removePendingWipeMarker;
    const logError = deps.onOperationError ?? defaultLogOperationError;

    const failedOperations: string[] = [];

    const runStep = async (operation: string, step: () => Promise<void>): Promise<void> => {
      try {
        await step();
      } catch {
        failedOperations.push(operation);
        logError(operation);
      }
    };

    await runStep('syncEngine.stopAndWait', stopAndWaitSync);
    await runStep('wipeLocalData', wipeDatabase);
    await runStep('clearLegacyFollowUpData', () =>
      userId ? clearUserFollowUpData(userId) : clearAllFollowUpData(),
    );

    if (userId) {
      await runStep('clearReferralDraft', () => clearUserReferralDraft(userId));
    }

    if (failedOperations.length > 0) {
      try {
        await setMarker();
      } catch {
        logError('setPendingWipeMarker');
      }
      return { succeeded: false, failedOperations };
    }

    try {
      await clearMarker();
    } catch {
      logError('clearPendingWipeMarker');
    }

    return { succeeded: true, failedOperations: [] };
  });
}

/**
 * Reintenta el borrado local pendiente cuando un cierre de sesión previo no pudo completar
 * la limpieza de almacenamiento. Debe llamarse al iniciar la aplicación.
 */
export async function retryPendingLocalWipeIfNeeded(
  deps: LocalWipeDependencies = {},
): Promise<boolean> {
  const hasMarker = deps.hasPendingWipeMarker ?? readPendingWipeMarker;
  try {
    if (!(await hasMarker())) {
      return false;
    }
  } catch {
    return false;
  }

  const result = await wipeUserLocalStorage({ userId: null, deps });
  return result.succeeded;
}

/**
 * Limpieza al expirar la sesión automáticamente:
 * detiene el motor, conserva la base cifrada y la cola si existen pendientes del usuario
 * (para evitar perder trabajo clínico sin avisar), y borra todo si no hay pendientes.
 */
export async function cleanupOnSessionExpired(
  userId: string | null,
  deps: LocalWipeDependencies = {},
): Promise<SessionExpiredCleanupResult> {
  const stopAndWaitSync = deps.stopAndWaitSync ?? syncEngine.stopAndWait;
  const logError = deps.onOperationError ?? defaultLogOperationError;

  try {
    await stopAndWaitSync();
  } catch {
    logError('syncEngine.stopAndWait');
  }

  const unsent = await hasUnsentSyncRecords(userId, deps);
  if (unsent) {
    return { hadUnsentRecords: true, wiped: false };
  }

  const wipeResult = await wipeUserLocalStorage({ userId, deps });
  return { hadUnsentRecords: false, wiped: wipeResult.succeeded };
}
