import type { LocalDb } from './types.js';

/** Definición de una migración versionada del esquema local. */
export interface Migration {
  version: number;
  name: string;
  up: (db: LocalDb) => Promise<void>;
}

const MIGRATION_V1_SQL = `
CREATE TABLE IF NOT EXISTS children (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS checkups (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  measured_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  sync_state TEXT NOT NULL CHECK (sync_state IN ('LOCAL', 'SENT')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_checkups_user_child_measured
  ON checkups (user_id, child_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS indicator_results (
  user_id TEXT NOT NULL,
  checkup_id TEXT NOT NULL,
  indicator TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, checkup_id, indicator)
);

CREATE TABLE IF NOT EXISTS reference_curves (
  indicator TEXT NOT NULL,
  sex TEXT NOT NULL,
  position TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (indicator, sex, position)
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checkup', 'follow-up', 'feeding')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('LOCAL', 'SENDING', 'SENT', 'ERROR')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_user_status_next
  ON sync_queue (user_id, status, next_attempt_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Lista ordenada de migraciones del esquema local. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_offline_schema',
    up: async (db) => {
      await db.execAsync(MIGRATION_V1_SQL);
    },
  },
];

/** Versión más reciente del esquema local soportada por la app. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/**
 * Ejecuta en transacción las migraciones pendientes según `PRAGMA user_version`.
 * Es idempotente y falla de forma explícita si la base tiene una versión futura.
 */
export async function runMigrations(db: LocalDb): Promise<number> {
  const versionRow = await db.getFirstAsync<{ user_version?: number }>('PRAGMA user_version;', []);
  const currentVersion =
    versionRow && typeof versionRow.user_version === 'number' ? versionRow.user_version : 0;

  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error(`Versión de base de datos local inválida: ${String(currentVersion)}.`);
  }

  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `La base de datos local tiene una versión (${currentVersion}) superior a la soportada (${LATEST_SCHEMA_VERSION}).`,
    );
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > currentVersion);
  if (pending.length === 0) {
    return currentVersion;
  }

  let appliedVersion = currentVersion;
  for (const migration of pending) {
    if (!Number.isInteger(migration.version) || migration.version <= appliedVersion) {
      throw new Error(`Orden de migración inválido en versión ${migration.version}.`);
    }

    await db.withTransactionAsync(async () => {
      await migration.up(db);
      // PRAGMA no acepta parámetros enlazados en SQLite; la versión ya fue validada como entero positivo.
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    });

    appliedVersion = migration.version;
  }

  return appliedVersion;
}
