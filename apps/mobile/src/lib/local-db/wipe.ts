import * as SQLite from 'expo-sqlite';
import { closeLocalDatabase, LOCAL_DATABASE_NAME } from './database.js';
import { deleteDatabaseKey } from './encrypted-db.js';

/**
 * Borrado seguro de todos los datos locales cifrados al cerrar sesión (NK-63):
 * 1. Cierra la conexión compartida y reinicia los singletons en memoria.
 * 2. Elimina el archivo SQLite `nutrikids.db` del almacenamiento local.
 * 3. Elimina la clave de cifrado de SecureStore y limpia la promesa en memoria.
 * Tolera que la base o la clave no existan todavía.
 */
export async function wipeLocalData(): Promise<void> {
  await closeLocalDatabase();

  if (typeof SQLite.deleteDatabaseAsync === 'function') {
    try {
      await SQLite.deleteDatabaseAsync(LOCAL_DATABASE_NAME);
    } catch {
      // Se tolera que el archivo aún no exista o que el entorno no use almacenamiento en disco.
    }
  }

  await deleteDatabaseKey();
}
