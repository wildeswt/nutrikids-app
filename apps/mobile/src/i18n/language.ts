import * as SecureStore from 'expo-secure-store';
import i18n from './index.js';
import { SUPPORTED_LANGUAGES, type AppLanguage } from './resources.js';

export const LANGUAGE_STORAGE_KEY = 'nutrikids.language';

/** In-memory fallback for runtimes without SecureStore or localStorage (tests). */
const memoryStorage = new Map<string, string>();

async function hasSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

function isSupportedLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

/** Reads the language the user picked in the app, if any. */
export async function getStoredLanguage(): Promise<AppLanguage | null> {
  try {
    let raw: string | null;
    if (await hasSecureStore()) {
      raw = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
    } else if (typeof window !== 'undefined' && window.localStorage) {
      raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } else {
      raw = memoryStorage.get(LANGUAGE_STORAGE_KEY) ?? null;
    }
    return isSupportedLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function storeLanguage(language: AppLanguage): Promise<void> {
  try {
    if (await hasSecureStore()) {
      await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, language);
    } else if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } else {
      memoryStorage.set(LANGUAGE_STORAGE_KEY, language);
    }
  } catch {
    // The preference is a convenience: if it cannot be saved, the change still applies now.
  }
}

/** Changes the app language immediately and remembers it for the next launch. */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  await storeLanguage(language);
}

/**
 * Applies the language saved by the user (if any). Called once at startup; when nothing was
 * saved, the device language detected in `./index.ts` is kept.
 */
export async function restoreLanguagePreference(): Promise<void> {
  const stored = await getStoredLanguage();
  if (stored && stored !== i18n.language) {
    await i18n.changeLanguage(stored);
  }
}
