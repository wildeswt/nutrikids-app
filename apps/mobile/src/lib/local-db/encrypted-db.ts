import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

/** Clave en SecureStore donde se persiste la clave simétrica de SQLCipher. */
export const DATABASE_KEY_STORAGE_KEY = 'nutrikids.localDb.encryptionKey';

/** Longitud esperada de la clave aleatoria de 32 bytes codificada en hexadecimal. */
const DATABASE_KEY_BYTE_LENGTH = 32;
const HEX_KEY_REGEX = /^[0-9a-f]{64}$/i;

/** Opciones de SecureStore equivalentes a lib/session-storage.ts: solo dispositivo desbloqueado, sin respaldo. */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Promesa compartida para evitar carreras si getDatabaseKey se invoca en paralelo la primera vez. */
let pendingKeyPromise: Promise<string> | null = null;

/** Verifica que expo-secure-store esté disponible en el entorno actual. */
async function assertSecureStoreAvailable(): Promise<void> {
  let available: boolean;
  try {
    available = await SecureStore.isAvailableAsync();
  } catch {
    available = false;
  }

  if (!available) {
    throw new Error(
      'Almacenamiento seguro no disponible: no se puede gestionar la clave de la base de datos cifrada.',
    );
  }
}

/** Genera una clave aleatoria de 32 bytes (256 bits) codificada en 64 caracteres hexadecimales. */
function generateHexKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error(
      'crypto.getRandomValues no está disponible en este entorno para generar la clave de cifrado.',
    );
  }

  const bytes = new Uint8Array(DATABASE_KEY_BYTE_LENGTH);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Carga la clave existente desde SecureStore o genera y persiste una nueva una sola vez. */
async function loadOrCreateDatabaseKey(): Promise<string> {
  await assertSecureStoreAvailable();

  const existingKey = await SecureStore.getItemAsync(
    DATABASE_KEY_STORAGE_KEY,
    SECURE_STORE_OPTIONS,
  );

  if (existingKey !== null) {
    if (!HEX_KEY_REGEX.test(existingKey)) {
      throw new Error('La clave de cifrado almacenada en SecureStore tiene un formato inválido.');
    }
    return existingKey;
  }

  const newKey = generateHexKey();
  await SecureStore.setItemAsync(DATABASE_KEY_STORAGE_KEY, newKey, SECURE_STORE_OPTIONS);
  return newKey;
}

/**
 * Obtiene la clave de cifrado de la base local (32 bytes en hex).
 * Si aún no existe, la genera con CSPRNG y la guarda en SecureStore con protección local al dispositivo.
 */
export async function getDatabaseKey(): Promise<string> {
  if (!pendingKeyPromise) {
    pendingKeyPromise = loadOrCreateDatabaseKey().finally(() => {
      pendingKeyPromise = null;
    });
  }
  return pendingKeyPromise;
}

/**
 * Elimina la clave de cifrado almacenada en SecureStore y limpia la promesa en memoria.
 * Tolera entornos donde SecureStore no esté disponible o la clave no exista.
 */
export async function deleteDatabaseKey(): Promise<void> {
  const inFlight = pendingKeyPromise;
  pendingKeyPromise = null;
  if (inFlight) {
    await inFlight.catch(() => {});
  }
  pendingKeyPromise = null;

  let available: boolean;
  try {
    available = await SecureStore.isAvailableAsync();
  } catch {
    available = false;
  }

  if (!available) {
    return;
  }

  try {
    await SecureStore.deleteItemAsync(DATABASE_KEY_STORAGE_KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Se tolera que la clave ya no exista al limpiar en cierre de sesión.
  }
}

/** Verifica que SQLite nativo con SQLCipher pueda usarse en la plataforma actual. */
function assertNativeSqliteAvailable(): void {
  if (Platform.OS === 'web' && !Platform.isTesting) {
    throw new Error('SQLite cifrado no está disponible en web ni en entornos sin módulo nativo.');
  }

  if (typeof SQLite.openDatabaseAsync !== 'function') {
    throw new Error('El módulo nativo de expo-sqlite no está disponible en este entorno.');
  }
}

/**
 * Abre una base de datos SQLite local cifrada con SQLCipher, aplica la clave mediante PRAGMA key
 * antes de cualquier consulta y verifica que la base sea legible.
 */
export async function openEncryptedDatabase(name: string): Promise<SQLite.SQLiteDatabase> {
  assertNativeSqliteAvailable();

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('El nombre de la base de datos local no puede estar vacío.');
  }

  const key = await getDatabaseKey();
  if (!HEX_KEY_REGEX.test(key)) {
    throw new Error('La clave de cifrado obtenida no cumple el formato hexadecimal de 256 bits.');
  }

  const database = await SQLite.openDatabaseAsync(trimmedName);

  try {
    // Se aplica la clave cruda de 256 bits antes de cualquier lectura o escritura sobre las páginas.
    await database.execAsync(`PRAGMA key = "x'${key}'";`);
    // SQLCipher valida la clave realmente al leer la página raíz (sqlite_master).
    await database.getFirstAsync<{ count: number }>('SELECT count(*) AS count FROM sqlite_master;');
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => {});
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo abrir o verificar la base de datos cifrada: ${detail}`, {
      cause: error,
    });
  }
}
