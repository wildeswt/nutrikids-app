import type * as SQLite from 'expo-sqlite';

/** Clave en SecureStore (solo nativo; en web no se usa base cifrada). */
export const DATABASE_KEY_STORAGE_KEY = 'nutrikids.localDb.encryptionKey';

const WEB_SQLITE_UNAVAILABLE_ERROR =
  'SQLite cifrado no está disponible en web ni en entornos sin módulo nativo.';

/** En web no existe almacenamiento seguro para gestionar claves SQLCipher. */
export async function getDatabaseKey(): Promise<string> {
  throw new Error(WEB_SQLITE_UNAVAILABLE_ERROR);
}

/** No-op en web: nunca se genera ni persiste clave local de SQLCipher. */
export async function deleteDatabaseKey(): Promise<void> {}

/**
 * En web se evita importar `expo-sqlite` / `wa-sqlite.wasm` en el bundle.
 * La capa `tryGetLocalDatabase` captura este error y opera en modo solo en línea.
 */
export async function openEncryptedDatabase(_name: string): Promise<SQLite.SQLiteDatabase> {
  throw new Error(WEB_SQLITE_UNAVAILABLE_ERROR);
}
