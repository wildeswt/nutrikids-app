import i18n from '../i18n/index.js';
import { getConnectivity, type ConnectivityStatus } from './connectivity.js';
import { getLocalDatabase, type LocalDb } from './local-db/index.js';

/** Clasificación del fallo de carga cuando no hubo datos locales disponibles. */
export type LoadErrorKind = 'needs-connection' | 'error';

/** Instantánea leída desde la caché local junto con su fecha de última sincronización. */
export interface LocalCacheSnapshot<T> {
  data: T;
  lastSyncedAt: string | null;
}

/** Opciones del patrón de lectura «primero lo local, luego refrescar». */
export interface ReadThroughOptions<T> {
  readLocal: () => Promise<LocalCacheSnapshot<T> | null>;
  fetchRemote: () => Promise<T>;
  writeLocal: (data: T) => Promise<string | null | void>;
  deleteLocal?: () => Promise<void>;
  onLocalData?: (snapshot: LocalCacheSnapshot<T>) => void;
  operationName?: string;
  checkConnectivity?: () => Promise<ConnectivityStatus>;
}

/** Resultado resuelto por `readThrough`. */
export interface ReadThroughResult<T> {
  data: T;
  fromCache: boolean;
  stale: boolean;
  lastSyncedAt: string | null;
}

/** Error emitido cuando no hay datos en caché local y el dispositivo está sin conexión. */
export class OfflineNoDataError extends Error {
  constructor(message: string = i18n.t('errors:offlineNoData')) {
    super(message);
    this.name = 'OfflineNoDataError';
  }
}

/** Extrae el código HTTP `status` si el error proviene de una respuesta HTTP tipada. */
export function getHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

/**
 * Indica si el error corresponde a ausencia de conectividad o fallo de red
 * (sin respuesta HTTP del servidor).
 */
export function isNetworkUnavailableError(error: unknown): boolean {
  if (error instanceof OfflineNoDataError) {
    return true;
  }
  if (getHttpStatus(error) !== null) {
    return false;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return true;
    }
    if (error.name === 'ZodError') {
      return false;
    }
    return /network|fetch|offline|internet|timeout|econn|enotfound|etimedout|socket|connection|conexi[oó]n/i.test(
      error.message,
    );
  }
  return false;
}

/**
 * Indica si un error remoto es transitorio (red caída o HTTP 5xx), caso en el cual
 * se puede conservar la copia local marcada como desactualizada (`stale`).
 */
export function isTransientRemoteError(error: unknown): boolean {
  const status = getHttpStatus(error);
  if (status !== null) {
    return status >= 500 && status <= 599;
  }
  return isNetworkUnavailableError(error);
}

/** Distingue «sin datos y sin conexión» de un error real del servidor o de validación. */
export function classifyLoadError(error: unknown): LoadErrorKind {
  return isNetworkUnavailableError(error) ? 'needs-connection' : 'error';
}

const LOCAL_OP_FAILED = Symbol('LOCAL_OP_FAILED');

async function runLocalSafely<T>(
  operationName: string,
  fn: () => Promise<T>,
): Promise<T | typeof LOCAL_OP_FAILED> {
  try {
    return await fn();
  } catch (error) {
    // Se registra únicamente el nombre de la operación para no exponer datos personales ni clínicos.
    console.warn(`[offline-read] Error de almacenamiento local en ${operationName}`);
    // Solo en desarrollo: el mensaje del error (apertura, cifrado, migración) ayuda a diagnosticar.
    if (typeof __DEV__ !== 'undefined' && __DEV__ && error instanceof Error) {
      console.info(`[offline-read] Causa (solo desarrollo): ${error.message}`);
    }
    return LOCAL_OP_FAILED;
  }
}

/**
 * Ejecuta una operación contra el almacenamiento local capturando cualquier fallo
 * (apertura, validación o escritura) y registrando solo el nombre de la operación.
 */
export async function tryLocalOperation<T>(
  operationName: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const result = await runLocalSafely(operationName, fn);
  return result === LOCAL_OP_FAILED ? fallback : result;
}

/**
 * Obtiene la base de datos local cifrada con degradación elegante (Expo Go / web).
 * Si falla la apertura, registra únicamente la operación y devuelve `null`.
 */
export async function tryGetLocalDatabase(operationName: string): Promise<LocalDb | null> {
  return tryLocalOperation(operationName, () => getLocalDatabase(), null);
}

async function resolveConnectivity(
  checkConnectivity?: () => Promise<ConnectivityStatus>,
): Promise<ConnectivityStatus> {
  try {
    return await (checkConnectivity ?? getConnectivity)();
  } catch {
    return 'online';
  }
}

/**
 * Lectura con caché genérica siguiendo el patrón «primero lo local, luego refrescar»:
 * 1. Lee la copia local y la entrega inmediatamente con `onLocalData` si existe.
 * 2. Con conexión pide al servidor y actualiza la copia local con `writeLocal`.
 * 3. Si falla por red o 5xx y hay copia local, la conserva con `stale: true`.
 * 4. Los errores 401/403/404 se propagan siempre; 403/404 borran la copia local.
 */
export async function readThrough<T>(
  options: ReadThroughOptions<T>,
): Promise<ReadThroughResult<T>> {
  const operationName = options.operationName ?? 'readThrough';

  const local = await tryLocalOperation(`${operationName}.readLocal`, options.readLocal, null);
  if (local !== null) {
    options.onLocalData?.(local);
  }

  const connectivity = await resolveConnectivity(options.checkConnectivity);
  if (connectivity === 'offline') {
    if (local !== null) {
      return {
        data: local.data,
        fromCache: true,
        stale: true,
        lastSyncedAt: local.lastSyncedAt,
      };
    }
    throw new OfflineNoDataError();
  }

  try {
    const remote = await options.fetchRemote();
    const writeResult = await runLocalSafely(`${operationName}.writeLocal`, () =>
      options.writeLocal(remote),
    );
    const lastSyncedAt =
      writeResult === LOCAL_OP_FAILED
        ? null
        : typeof writeResult === 'string'
          ? writeResult
          : new Date().toISOString();

    return {
      data: remote,
      fromCache: false,
      stale: false,
      lastSyncedAt,
    };
  } catch (error) {
    const status = getHttpStatus(error);
    if ((status === 403 || status === 404) && options.deleteLocal) {
      await tryLocalOperation(`${operationName}.deleteLocal`, options.deleteLocal, undefined);
    }

    if (local !== null && isTransientRemoteError(error)) {
      return {
        data: local.data,
        fromCache: true,
        stale: true,
        lastSyncedAt: local.lastSyncedAt,
      };
    }

    throw error;
  }
}

/**
 * Ejecuta una escritura en línea y cae a guardado local en cola cuando el dispositivo está sin
 * conexión o el envío falla por error de red (nunca ante respuestas HTTP 4xx/5xx).
 */
export async function executeOfflineWriteFallback<T>(options: {
  isOnline: boolean;
  sendRemote: () => Promise<T>;
  persistLocally: () => Promise<T>;
  isNetworkError?: (error: unknown) => boolean;
  syncNow?: () => Promise<void>;
  refreshSyncState?: () => Promise<unknown>;
}): Promise<T> {
  const isNetworkError = options.isNetworkError ?? isNetworkUnavailableError;

  if (!options.isOnline) {
    let localResult: T;
    try {
      localResult = await options.persistLocally();
    } catch (persistError) {
      // No local queue (web): the «offline» flag can be wrong, so try the server before failing.
      try {
        return await options.sendRemote();
      } catch {
        throw persistError;
      }
    }
    if (options.refreshSyncState) {
      void options.refreshSyncState().catch(() => {});
    }
    return localResult;
  }

  try {
    return await options.sendRemote();
  } catch (error) {
    // Los errores 4xx/5xx del servidor no caen a local; solo fallos de red / conectividad.
    if (!isNetworkError(error)) {
      throw error;
    }
    const localResult = await options.persistLocally();
    if (options.syncNow) {
      // Si se guardó con red disponible/recuperada, dispara un envío sin bloquear la UI.
      void options.syncNow().catch(() => {});
    }
    return localResult;
  }
}
