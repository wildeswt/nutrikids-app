import { AuthUserSchema, UserRoleSchema, type UserRole } from '@nutrikids/shared';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

export const SESSION_STORAGE_KEY = 'nutrikids.auth.session';

/**
 * Validated schema for persistent auth session.
 * Stores tokens, expiration timestamp, public user payload, and active role.
 */
export const StoredSessionSchema = z.object({
  accessToken: z.string().min(1, { message: 'Missing access token' }),
  refreshToken: z.string().min(1, { message: 'Missing refresh token' }),
  expiresAt: z.number().int().positive(),
  user: AuthUserSchema,
  activeRole: UserRoleSchema,
});

export type StoredSession = z.infer<typeof StoredSessionSchema>;

/** In-memory storage fallback for web/testing environments where SecureStore is unavailable. */
const memoryStorage = new Map<string, string>();

/** Check if expo-secure-store is supported in the current runtime. */
async function hasSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/** SecureStore options for device keychain/keystore. */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Read the stored session from SecureStore (or in-memory fallback).
 * If data is corrupt or fails schema validation, clears the key and returns null.
 */
export async function getStoredSession(): Promise<StoredSession | null> {
  try {
    let raw: string | null = null;
    if (await hasSecureStore()) {
      raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY, SECURE_STORE_OPTIONS);
    } else {
      raw = memoryStorage.get(SESSION_STORAGE_KEY) ?? null;
    }

    if (!raw) {
      return null;
    }

    const parsedJson: unknown = JSON.parse(raw);
    const result = StoredSessionSchema.safeParse(parsedJson);

    if (!result.success) {
      // Corrupted session payload: clear it fail-safe.
      await clearStoredSession();
      return null;
    }

    return result.data;
  } catch {
    await clearStoredSession();
    return null;
  }
}

/**
 * Persist an active session in SecureStore.
 */
export async function saveStoredSession(session: StoredSession): Promise<void> {
  const validated = StoredSessionSchema.parse(session);
  const serialized = JSON.stringify(validated);

  if (await hasSecureStore()) {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, serialized, SECURE_STORE_OPTIONS);
  } else {
    memoryStorage.set(SESSION_STORAGE_KEY, serialized);
  }
}

/**
 * Remove active session from SecureStore.
 */
export async function clearStoredSession(): Promise<void> {
  try {
    if (await hasSecureStore()) {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY, SECURE_STORE_OPTIONS);
    }
  } finally {
    memoryStorage.delete(SESSION_STORAGE_KEY);
  }
}

/**
 * Update the active session tokens while keeping user profile and active role intact.
 */
export async function updateStoredTokens(params: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<StoredSession | null> {
  const current = await getStoredSession();
  if (!current) {
    return null;
  }

  const updated: StoredSession = {
    ...current,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    expiresAt: Date.now() + params.expiresIn * 1000,
  };

  await saveStoredSession(updated);
  return updated;
}

/**
 * Update the active role in the persisted session.
 */
export async function updateStoredActiveRole(newRole: UserRole): Promise<StoredSession | null> {
  const current = await getStoredSession();
  if (!current) {
    return null;
  }

  if (!current.user.roles.includes(newRole)) {
    throw new Error(`User does not have role: ${newRole}`);
  }

  const updated: StoredSession = {
    ...current,
    activeRole: newRole,
  };

  await saveStoredSession(updated);
  return updated;
}
