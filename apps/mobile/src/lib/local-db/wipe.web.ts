import { closeLocalDatabase } from './database.js';
import { deleteDatabaseKey } from './encrypted-db.js';

/**
 * En web no existe archivo SQLite local en disco ni `expo-sqlite` en el bundle;
 * solo cierra cualquier referencia en memoria y limpia la clave si existiera.
 */
export async function wipeLocalData(): Promise<void> {
  await closeLocalDatabase();
  await deleteDatabaseKey();
}
