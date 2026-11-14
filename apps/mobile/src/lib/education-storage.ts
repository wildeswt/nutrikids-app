import {
  EducationalContentResponseSchema,
  type EducationalContentResponse,
} from '@nutrikids/shared';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { z } from 'zod';

/**
 * Local copy of the educational catalog of one language, so the articles can be read without
 * connection (NK-40 decision: download once, filter by age on the phone, refresh with ETag).
 * It is public reference content, not child data, so it is a plain JSON file (the articles are
 * too big for SecureStore).
 */
const StoredCatalogSchema = z.object({
  language: z.string(),
  etag: z.string().nullable(),
  savedAt: z.string(),
  articles: z.array(EducationalContentResponseSchema),
});

export type StoredCatalog = z.infer<typeof StoredCatalogSchema>;

const memoryStorage = new Map<string, string>();

function storageKey(language: string): string {
  return `nutrikids.education.${language}`;
}

function nativeFile(language: string): File {
  return new File(Paths.document, `${storageKey(language)}.json`);
}

async function readRaw(language: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(storageKey(language)) ?? null;
    }
    const file = nativeFile(language);
    return file.exists ? await file.text() : null;
  } catch {
    return memoryStorage.get(storageKey(language)) ?? null;
  }
}

async function writeRaw(language: string, raw: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(storageKey(language), raw);
      return;
    }
    const file = nativeFile(language);
    file.create({ overwrite: true });
    await file.write(raw);
  } catch {
    // Without disk the copy lives in memory until the app closes.
    memoryStorage.set(storageKey(language), raw);
  }
}

/** The saved catalog of a language, or `null` when none was saved or the file is unreadable. */
export async function readStoredCatalog(language: string): Promise<StoredCatalog | null> {
  const raw = await readRaw(language);
  if (!raw) return null;

  try {
    const parsed = StoredCatalogSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Saves (replaces) the catalog of a language. Never throws: reading offline is a convenience. */
export async function writeStoredCatalog(
  language: string,
  catalog: { articles: EducationalContentResponse[]; etag: string | null },
): Promise<void> {
  const stored: StoredCatalog = {
    language,
    etag: catalog.etag,
    savedAt: new Date().toISOString(),
    articles: catalog.articles,
  };
  await writeRaw(language, JSON.stringify(stored));
}
