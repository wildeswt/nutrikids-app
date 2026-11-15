/** Valores binarios admitidos como parámetros enlazados en SQLite. */
export type SqlBindBlobValue = Uint8Array | ArrayBuffer;

/** Tipos escalares y binarios admitidos en consultas parametrizadas de SQLite. */
export type SqlBindValue = string | number | null | boolean | SqlBindBlobValue;

/** Parámetros posicionales o nombrados para sentencias SQL preparadas. */
export type SqlBindParams = Record<string, SqlBindValue> | SqlBindValue[];

/** Resultado de una operación de escritura (`INSERT`, `UPDATE`, `DELETE`). */
export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

/**
 * Interfaz mínima de base de datos SQLite compatible con `SQLiteDatabase` de `expo-sqlite`.
 * Permite desacoplar migraciones y repositorios del motor nativo para probar con SQL real.
 */
export interface LocalDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlBindParams): Promise<SqlRunResult>;
  runAsync(sql: string, ...params: SqlBindValue[]): Promise<SqlRunResult>;
  getAllAsync<T>(sql: string, params: SqlBindParams): Promise<T[]>;
  getAllAsync<T>(sql: string, ...params: SqlBindValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlBindParams): Promise<T | null>;
  getFirstAsync<T>(sql: string, ...params: SqlBindValue[]): Promise<T | null>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

/** Estado de sincronización de un control almacenado localmente. */
export type SyncCheckupState = 'LOCAL' | 'SENT';

/** Tipo de entidad encolada para sincronización. */
export type SyncQueueKind = 'checkup' | 'follow-up' | 'feeding';

/** Estado de un elemento dentro de la cola `sync_queue`. */
export type SyncQueueStatus = 'LOCAL' | 'SENDING' | 'SENT' | 'ERROR';
