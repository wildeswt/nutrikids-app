import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { useEducation } from '../hooks/useEducation.js';
import i18n from '../i18n/index.js';
import * as educationApi from '../lib/education-api.js';
import * as educationStorage from '../lib/education-storage.js';

const make = (n: number, language = 'es') => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  title: `Artículo ${n}`,
  body: 'Texto',
  minAgeMonths: 12,
  maxAgeMonths: 23,
  language,
});

const stored = (articles: ReturnType<typeof make>[], etag: string | null = 'W/"old"') => ({
  language: 'es',
  etag,
  savedAt: '2026-11-01T00:00:00.000Z',
  articles,
});

function capture<T>(useHook: () => T): { current: T } {
  const captured = {} as { current: T };
  function TestComponent() {
    captured.current = useHook();
    return React.createElement('div', null, 'ok');
  }
  renderToString(React.createElement(TestComponent));
  return captured;
}

describe('useEducation hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(educationStorage, 'writeStoredCatalog').mockResolvedValue();
  });

  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('starts idle and does not download on its own (the screen loads on focus)', () => {
    const fetchSpy = vi.spyOn(educationApi, 'fetchEducationCatalog');
    const hook = capture(() => useEducation());

    expect(hook.current.status).toBe('idle');
    expect(hook.current.articles).toEqual([]);
    expect(hook.current.offline).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(typeof hook.current.load).toBe('function');
  });

  it('downloads the catalog the first time and saves it with its ETag', async () => {
    const articles = [make(1), make(2)];
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(null);
    const fetchSpy = vi
      .spyOn(educationApi, 'fetchEducationCatalog')
      .mockResolvedValue({ notModified: false, articles, etag: 'W/"new"' });
    const hook = capture(() => useEducation());

    await expect(hook.current.load()).resolves.toEqual(articles);

    expect(fetchSpy).toHaveBeenCalledWith('es', undefined);
    expect(educationStorage.writeStoredCatalog).toHaveBeenCalledWith('es', {
      articles,
      etag: 'W/"new"',
    });
  });

  it('revalidates with the saved ETag and keeps the saved copy on a 304', async () => {
    const articles = [make(1)];
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(stored(articles));
    const fetchSpy = vi
      .spyOn(educationApi, 'fetchEducationCatalog')
      .mockResolvedValue({ notModified: true });
    const hook = capture(() => useEducation());

    await expect(hook.current.load()).resolves.toEqual(articles);

    expect(fetchSpy).toHaveBeenCalledWith('es', 'W/"old"');
    expect(educationStorage.writeStoredCatalog).not.toHaveBeenCalled();
  });

  it('replaces the saved copy when the server has a new catalog', async () => {
    const fresh = [make(1), make(3)];
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(stored([make(1)]));
    vi.spyOn(educationApi, 'fetchEducationCatalog').mockResolvedValue({
      notModified: false,
      articles: fresh,
      etag: 'W/"v2"',
    });
    const hook = capture(() => useEducation());

    await expect(hook.current.load()).resolves.toEqual(fresh);
    expect(educationStorage.writeStoredCatalog).toHaveBeenCalledWith('es', {
      articles: fresh,
      etag: 'W/"v2"',
    });
  });

  it('reads the saved copy when there is no connection', async () => {
    const articles = [make(1)];
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(stored(articles));
    vi.spyOn(educationApi, 'fetchEducationCatalog').mockRejectedValue(
      new TypeError('Network request failed'),
    );
    const hook = capture(() => useEducation());

    await expect(hook.current.load()).resolves.toEqual(articles);
  });

  it('returns null with nothing saved and no connection (needs a first download)', async () => {
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(null);
    vi.spyOn(educationApi, 'fetchEducationCatalog').mockRejectedValue(
      new TypeError('Network request failed'),
    );
    const hook = capture(() => useEducation());

    await expect(hook.current.load()).resolves.toBeNull();
  });

  it('shows the saved copy right away while the server is asked', async () => {
    const articles = [make(1)];
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(stored(articles));
    let release!: () => void;
    vi.spyOn(educationApi, 'fetchEducationCatalog').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ notModified: true });
        }),
    );
    const hook = capture(() => useEducation());

    const loading = hook.current.load();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();

    await expect(loading).resolves.toEqual(articles);
  });

  it('falls back to the Spanish catalog when the language has no content yet (Kichwa)', async () => {
    await i18n.changeLanguage('qu');
    const spanish = [make(1), make(2)];
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(null);
    const fetchSpy = vi
      .spyOn(educationApi, 'fetchEducationCatalog')
      .mockImplementation(async (language) => ({
        notModified: false,
        articles: language === 'qu' ? [] : spanish,
        etag: `W/"${language}"`,
      }));
    const hook = capture(() => useEducation());

    await expect(hook.current.load()).resolves.toEqual(spanish);

    expect(fetchSpy.mock.calls.map(([language]) => language)).toEqual(['qu', 'es']);
  });

  it('does not ask for the Spanish catalog when the language already has content', async () => {
    await i18n.changeLanguage('qu');
    const kichwa = [make(1, 'qu')];
    vi.spyOn(educationStorage, 'readStoredCatalog').mockResolvedValue(null);
    const fetchSpy = vi
      .spyOn(educationApi, 'fetchEducationCatalog')
      .mockResolvedValue({ notModified: false, articles: kichwa, etag: null });
    const hook = capture(() => useEducation());

    await expect(hook.current.load()).resolves.toEqual(kichwa);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
