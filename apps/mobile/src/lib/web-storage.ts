const PRESERVED_LOCAL_KEYS = new Set(['nutrikids.language', 'nutrikids.localDb.pendingWipe']);
const PRESERVED_LOCAL_PREFIXES = ['nutrikids.education.'] as const;
const SENSITIVE_KEY_PREFIX = 'nutrikids.';

function readStorage(kind: 'sessionStorage' | 'localStorage'): Storage | null {
  try {
    const win = (
      globalThis as { window?: Partial<Record<'sessionStorage' | 'localStorage', Storage>> }
    ).window;
    const candidate =
      win?.[kind] ??
      (globalThis as Partial<Record<'sessionStorage' | 'localStorage', Storage>>)[kind];
    if (
      candidate &&
      typeof candidate.getItem === 'function' &&
      typeof candidate.setItem === 'function' &&
      typeof candidate.removeItem === 'function'
    ) {
      return candidate;
    }
    return null;
  } catch {
    // Accessing storage can throw SecurityError in sandboxed contexts or disabled storage modes.
    return null;
  }
}

function isPreservedLocalKey(key: string): boolean {
  if (PRESERVED_LOCAL_KEYS.has(key)) return true;
  return PRESERVED_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function removeKeysFromStorage(storage: Storage | null, keepPreserved: boolean): void {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') {
    return;
  }
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || !key.startsWith(SENSITIVE_KEY_PREFIX)) continue;
    if (keepPreserved && isPreservedLocalKey(key)) continue;
    keysToRemove.push(key);
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

/** Returns browser `sessionStorage` when available without throwing in restricted contexts. */
export function getWebSessionStorage(): Storage | null {
  return readStorage('sessionStorage');
}

/** Returns browser `localStorage` when available without throwing in restricted contexts. */
export function getWebLocalStorage(): Storage | null {
  return readStorage('localStorage');
}

/**
 * Reads a sensitive item on web from `sessionStorage` (tab-scoped, cleared when browser closes).
 */
export function readSensitiveWebItem(key: string): string | null {
  try {
    return getWebSessionStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes a sensitive item on web to `sessionStorage` and removes any legacy copy from `localStorage`.
 * Returns `true` when `sessionStorage` accepted the write.
 */
export function writeSensitiveWebItem(key: string, value: string): boolean {
  try {
    const session = getWebSessionStorage();
    if (!session) return false;
    session.setItem(key, value);
    // Clean up any pre-existing plaintext entry written by older web builds.
    getWebLocalStorage()?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes a sensitive item from both `sessionStorage` and `localStorage`.
 */
export function removeSensitiveWebItem(key: string): void {
  try {
    getWebSessionStorage()?.removeItem(key);
  } catch {
    // Ignore restricted storage errors during cleanup.
  }
  try {
    getWebLocalStorage()?.removeItem(key);
  } catch {
    // Ignore restricted storage errors during cleanup.
  }
}

/**
 * Removes all sensitive `nutrikids.*` entries from browser storage on sign-out / session expiry,
 * preserving only public/non-PII keys (language preference, offline educational catalog, pending wipe).
 */
export function purgeSensitiveWebStorage(): void {
  try {
    removeKeysFromStorage(getWebSessionStorage(), true);
  } catch {
    // Ignore storage enumeration failures.
  }
  try {
    removeKeysFromStorage(getWebLocalStorage(), true);
  } catch {
    // Ignore storage enumeration failures.
  }
}
