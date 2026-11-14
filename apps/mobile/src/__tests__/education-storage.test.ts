import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredCatalog, writeStoredCatalog } from '../lib/education-storage.js';

/** In-memory files of the `expo-file-system` mock (see setup.ts). */
const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;

const article = {
  id: 'e0000000-0000-4000-8000-000000000001',
  title: 'Cuántas comidas necesita tu hijo',
  body: 'A esta edad tu hijo come cinco veces al día.',
  minAgeMonths: 12,
  maxAgeMonths: 23,
  language: 'es',
};

describe('education-storage', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    files.clear();
  });

  afterEach(() => {
    Platform.OS = originalOS;
    vi.unstubAllGlobals();
  });

  describe('on the phone (JSON file)', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('returns null when nothing was saved', async () => {
      await expect(readStoredCatalog('es')).resolves.toBeNull();
    });

    it('saves the catalog with its ETag and reads it back', async () => {
      await writeStoredCatalog('es', { articles: [article], etag: 'W/"abc"' });

      const stored = await readStoredCatalog('es');

      expect(stored).toMatchObject({ language: 'es', etag: 'W/"abc"', articles: [article] });
      expect(stored?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('keeps one file per language and replaces the previous copy', async () => {
      await writeStoredCatalog('es', { articles: [article], etag: 'one' });
      await writeStoredCatalog('es', { articles: [], etag: 'two' });
      await writeStoredCatalog('qu', { articles: [], etag: null });

      expect(await readStoredCatalog('es')).toMatchObject({ etag: 'two', articles: [] });
      expect(await readStoredCatalog('qu')).toMatchObject({ etag: null });
      expect(files.size).toBe(2);
    });

    it('ignores a corrupt or outdated file instead of failing', async () => {
      await writeStoredCatalog('es', { articles: [article], etag: null });
      const [uri] = [...files.keys()];

      files.set(uri!, '{not json');
      await expect(readStoredCatalog('es')).resolves.toBeNull();

      files.set(uri!, JSON.stringify({ language: 'es', articles: [{ id: 'x' }] }));
      await expect(readStoredCatalog('es')).resolves.toBeNull();
    });
  });

  describe('on the web (localStorage)', () => {
    it('saves and reads the catalog from localStorage', async () => {
      Platform.OS = 'web';
      const storage = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
      });

      await writeStoredCatalog('es', { articles: [article], etag: 'W/"web"' });

      expect(storage.has('nutrikids.education.es')).toBe(true);
      expect(files.size).toBe(0);
      expect(await readStoredCatalog('es')).toMatchObject({ etag: 'W/"web"', articles: [article] });
    });
  });
});
