import type * as SQLite from 'expo-sqlite';
import { openEncryptedDatabase } from './encrypted-db.js';
import { runMigrations } from './migrations.js';

/** Nombre del archivo SQLite cifrado local en el dispositivo. */
export const LOCAL_DATABASE_NAME = 'nutrikids.db';

let databaseInstance: SQLite.SQLiteDatabase | null = null;
let openingPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let connectionEpoch = 0;

/**
 * Abre (una sola vez) la base de datos local cifrada, aplica migraciones pendientes
 * y devuelve la instancia compartida. Llamadas concurrentes comparten la misma promesa.
 */
export async function getLocalDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (databaseInstance) {
    return databaseInstance;
  }

  if (!openingPromise) {
    const epochAtStart = connectionEpoch;
    openingPromise = (async () => {
      const db = await openEncryptedDatabase(LOCAL_DATABASE_NAME);
      try {
        await runMigrations(db);
        if (epochAtStart !== connectionEpoch) {
          // Si la base se cerró o borró durante la apertura, no conservar esta instancia.
          await db.closeAsync().catch(() => {});
          throw new Error('La base de datos local fue cerrada durante su inicialización.');
        }
        databaseInstance = db;
        return db;
      } catch (error) {
        await db.closeAsync().catch(() => {});
        throw error;
      } finally {
        if (epochAtStart === connectionEpoch) {
          openingPromise = null;
        }
      }
    })();
  }

  return openingPromise;
}

/**
 * Cierra la instancia compartida de la base de datos local y reinicia el singleton.
 * Usado al cerrar sesión y en pruebas.
 */
export async function closeLocalDatabase(): Promise<void> {
  connectionEpoch += 1;
  const pending = openingPromise;
  openingPromise = null;

  if (pending) {
    const opened = await pending.catch(() => null);
    if (opened && opened !== databaseInstance) {
      await opened.closeAsync().catch(() => {});
    }
  }

  const current = databaseInstance;
  databaseInstance = null;

  if (current) {
    await current.closeAsync().catch(() => {});
  }
}
