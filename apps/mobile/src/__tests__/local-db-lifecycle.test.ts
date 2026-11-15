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
  closeLocalDatabase,
  getLocalDatabase,
  LOCAL_DATABASE_NAME,
} from '../lib/local-db/database.js';
import { DATABASE_KEY_STORAGE_KEY } from '../lib/local-db/encrypted-db.js';
import { wipeLocalData } from '../lib/local-db/wipe.js';

describe('local-db lifecycle (getLocalDatabase / closeLocalDatabase / wipeLocalData)', () => {
  beforeEach(async () => {
    await closeLocalDatabase();
    mockSecureStore.clear();
    vi.clearAllMocks();
    vi.mocked(SecureStore.isAvailableAsync).mockResolvedValue(true);
  });

  afterEach(async () => {
    await closeLocalDatabase();
  });

  it('opens the encrypted database once, shares the promise concurrently, and runs migrations', async () => {
    const [db1, db2] = await Promise.all([getLocalDatabase(), getLocalDatabase()]);
    const db3 = await getLocalDatabase();

    expect(db1).toBe(db2);
    expect(db2).toBe(db3);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(LOCAL_DATABASE_NAME);

    // Se ejecutó PRAGMA user_version y la migración v1 porque el mock devuelve { count: 0 } -> versión 0.
    expect(db1.getFirstAsync).toHaveBeenCalledWith('PRAGMA user_version;', []);
    expect(db1.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('closes the shared instance and allows reopening cleanly', async () => {
    const first = await getLocalDatabase();
    await closeLocalDatabase();

    expect(first.closeAsync).toHaveBeenCalledTimes(1);

    const second = await getLocalDatabase();
    expect(second).not.toBe(first);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it('wipeLocalData closes the db, deletes nutrikids.db, removes SecureStore key, and resets singletons', async () => {
    const firstDb = await getLocalDatabase();
    expect(mockSecureStore.has(DATABASE_KEY_STORAGE_KEY)).toBe(true);

    await wipeLocalData();

    expect(firstDb.closeAsync).toHaveBeenCalledTimes(1);
    expect(SQLite.deleteDatabaseAsync).toHaveBeenCalledWith(LOCAL_DATABASE_NAME);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(DATABASE_KEY_STORAGE_KEY, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(mockSecureStore.has(DATABASE_KEY_STORAGE_KEY)).toBe(false);

    // Tras borrar, getLocalDatabase vuelve a abrir una nueva instancia con clave nueva.
    const nextDb = await getLocalDatabase();
    expect(nextDb).not.toBe(firstDb);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it('wipeLocalData tolerates empty state when neither database nor key exist', async () => {
    vi.mocked(SQLite.deleteDatabaseAsync).mockRejectedValueOnce(new Error('Database not found'));

    await expect(wipeLocalData()).resolves.toBeUndefined();
    expect(SQLite.deleteDatabaseAsync).toHaveBeenCalledWith(LOCAL_DATABASE_NAME);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
  });
});
