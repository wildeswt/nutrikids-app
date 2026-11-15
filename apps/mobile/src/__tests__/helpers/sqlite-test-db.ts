import { DatabaseSync } from 'node:sqlite';
import type {
  LocalDb,
  SqlBindParams,
  SqlBindValue,
  SqlRunResult,
} from '../../lib/local-db/types.js';

type NodeSqliteParam = null | number | bigint | string | ArrayBufferView;

function normalizeBindValue(value: SqlBindValue): NodeSqliteParam {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return value;
}

function isNamedParamsObject(value: unknown): value is Record<string, SqlBindValue> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof ArrayBuffer)
  );
}

function normalizeStatementArgs(args: Array<SqlBindParams | SqlBindValue>): unknown[] {
  if (args.length === 0) {
    return [];
  }

  const first = args[0];
  if (args.length === 1 && Array.isArray(first)) {
    return first.map(normalizeBindValue);
  }

  if (args.length === 1 && isNamedParamsObject(first)) {
    const named: Record<string, NodeSqliteParam> = {};
    for (const [key, value] of Object.entries(first)) {
      named[key] = normalizeBindValue(value);
    }
    return [named];
  }

  return (args as SqlBindValue[]).map(normalizeBindValue);
}

/** Instancia de prueba de `LocalDb` respaldada por `node:sqlite` en memoria. */
export interface SqliteTestDb extends LocalDb {
  close(): void;
}

/**
 * Crea una base SQLite real en memoria sobre `node:sqlite` (`DatabaseSync`)
 * que implementa la interfaz `LocalDb` usada por migraciones y repositorios.
 */
export function createSqliteTestDb(location: string = ':memory:'): SqliteTestDb {
  const rawDb = new DatabaseSync(location);

  return {
    async execAsync(sql: string): Promise<void> {
      rawDb.exec(sql);
    },

    async runAsync(
      sql: string,
      ...args: Array<SqlBindParams | SqlBindValue>
    ): Promise<SqlRunResult> {
      const stmt = rawDb.prepare(sql);
      const bound = normalizeStatementArgs(args);
      const result = stmt.run(...bound);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },

    async getAllAsync<T>(sql: string, ...args: Array<SqlBindParams | SqlBindValue>): Promise<T[]> {
      const stmt = rawDb.prepare(sql);
      const bound = normalizeStatementArgs(args);
      return stmt.all(...bound) as T[];
    },

    async getFirstAsync<T>(
      sql: string,
      ...args: Array<SqlBindParams | SqlBindValue>
    ): Promise<T | null> {
      const stmt = rawDb.prepare(sql);
      const bound = normalizeStatementArgs(args);
      const row = stmt.get(...bound) as T | undefined;
      return row ?? null;
    },

    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      rawDb.exec('BEGIN');
      try {
        await fn();
        rawDb.exec('COMMIT');
      } catch (error) {
        try {
          rawDb.exec('ROLLBACK');
        } catch {
          // Ignorar si SQLite ya revirtió automáticamente la transacción.
        }
        throw error;
      }
    },

    close(): void {
      rawDb.close();
    },
  };
}
