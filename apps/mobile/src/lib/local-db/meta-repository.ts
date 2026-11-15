import type { LocalDb } from './types.js';

interface MetaRow {
  value: string;
}

/**
 * Lee un valor de configuración o estado persistido en la tabla `meta`.
 */
export async function getMetaValue(db: LocalDb, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<MetaRow>('SELECT value FROM meta WHERE key = ?;', [key]);
  return row ? row.value : null;
}

/**
 * Guarda o actualiza un valor en la tabla `meta`.
 */
export async function setMetaValue(db: LocalDb, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO meta (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value;`,
    [key, value],
  );
}

/**
 * Elimina una clave de la tabla `meta`.
 */
export async function removeMetaValue(db: LocalDb, key: string): Promise<void> {
  await db.runAsync('DELETE FROM meta WHERE key = ?;', [key]);
}

/** Repositorio tipado para la tabla local `meta`. */
export const metaRepository = {
  get: getMetaValue,
  set: setMetaValue,
  remove: removeMetaValue,
};
