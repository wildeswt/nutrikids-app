import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSecureStore = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));

import {
  DATABASE_KEY_STORAGE_KEY,
  getDatabaseKey,
  openEncryptedDatabase,
} from '../lib/local-db/encrypted-db.js';

describe('encrypted-db', () => {
  beforeEach(() => {
    mockSecureStore.clear();
    vi.clearAllMocks();
    vi.mocked(SecureStore.isAvailableAsync).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getDatabaseKey', () => {
    it('generates a 64-char hex key once and stores it with WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
      const key = await getDatabaseKey();

      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(DATABASE_KEY_STORAGE_KEY, key, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    });

    it('reuses the existing key on subsequent calls without regenerating it', async () => {
      const firstKey = await getDatabaseKey();
      const secondKey = await getDatabaseKey();

      expect(secondKey).toBe(firstKey);
      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    });

    it('shares a single generation when called concurrently', async () => {
      const [keyA, keyB] = await Promise.all([getDatabaseKey(), getDatabaseKey()]);

      expect(keyA).toBe(keyB);
      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    });

    it('throws a clear error when SecureStore is unavailable', async () => {
      vi.mocked(SecureStore.isAvailableAsync).mockResolvedValueOnce(false);

      await expect(getDatabaseKey()).rejects.toThrow(/Almacenamiento seguro no disponible/i);
    });

    it('throws a clear error if the stored key has an invalid format', async () => {
      mockSecureStore.set(DATABASE_KEY_STORAGE_KEY, 'not-a-valid-hex-key');

      await expect(getDatabaseKey()).rejects.toThrow(/formato inválido/i);
    });
  });

  describe('openEncryptedDatabase', () => {
    it('opens the database, applies PRAGMA key before any query, and verifies readability', async () => {
      const db = await openEncryptedDatabase('nutrikids.db');
      const expectedKey = mockSecureStore.get(DATABASE_KEY_STORAGE_KEY);

      expect(expectedKey).toMatch(/^[0-9a-f]{64}$/);
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('nutrikids.db');

      const execMock = vi.mocked(db.execAsync);
      const getFirstMock = vi.mocked(db.getFirstAsync);

      expect(execMock).toHaveBeenCalledWith(`PRAGMA key = "x'${expectedKey}'";`);
      expect(getFirstMock).toHaveBeenCalledWith('SELECT count(*) AS count FROM sqlite_master;');

      const pragmaOrder = execMock.mock.invocationCallOrder[0];
      const verifyOrder = getFirstMock.mock.invocationCallOrder[0];
      expect(pragmaOrder).toBeDefined();
      expect(verifyOrder).toBeDefined();
      expect(pragmaOrder!).toBeLessThan(verifyOrder!);
    });

    it('closes the database and throws a clear error if verification fails', async () => {
      const failingDb = {
        databasePath: 'corrupt.db',
        options: {},
        execAsync: vi.fn(async () => {}),
        getFirstAsync: vi.fn(async () => {
          throw new Error('file is not a database');
        }),
        closeAsync: vi.fn(async () => {}),
      };
      vi.mocked(SQLite.openDatabaseAsync).mockResolvedValueOnce(
        failingDb as unknown as SQLite.SQLiteDatabase,
      );

      await expect(openEncryptedDatabase('corrupt.db')).rejects.toThrow(
        /No se pudo abrir o verificar la base de datos cifrada: file is not a database/,
      );
      expect(failingDb.closeAsync).toHaveBeenCalledTimes(1);
    });

    it('degrades with a clear error when running on web outside test mode', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      await expect(openEncryptedDatabase('nutrikids.db')).rejects.toThrow(
        /SQLite cifrado no está disponible en web/,
      );
      expect(SQLite.openDatabaseAsync).not.toHaveBeenCalled();
    });

    it('throws a clear error when database name is empty', async () => {
      await expect(openEncryptedDatabase('   ')).rejects.toThrow(/no puede estar vacío/i);
    });
  });
});
