import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { EducationApiError, fetchEducationCatalog } from '../lib/education-api.js';

const article = {
  id: 'e0000000-0000-4000-8000-000000000001',
  title: 'Cuántas comidas necesita tu hijo',
  body: 'A esta edad tu hijo come cinco veces al día.',
  minAgeMonths: 12,
  maxAgeMonths: 23,
  language: 'es',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

describe('fetchEducationCatalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads the whole catalog of the language (no ageMonths) and keeps its ETag', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse([article], { headers: { ETag: 'W/"abc"' } }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchEducationCatalog('es');

    const [url] = mockFetch.mock.calls[0]!;
    expect(String(url)).toContain('/education?language=es');
    expect(String(url)).not.toContain('ageMonths');
    expect(result).toEqual({ notModified: false, articles: [article], etag: 'W/"abc"' });
  });

  it('sends If-None-Match with the saved ETag and reports a 304 as not modified', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchEducationCatalog('es', 'W/"abc"');

    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('If-None-Match')).toBe('W/"abc"');
    expect(result).toEqual({ notModified: true });
  });

  it('does not send If-None-Match without a saved copy', async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchEducationCatalog('qu');

    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).has('If-None-Match')).toBe(false);
    expect(result).toEqual({ notModified: false, articles: [], etag: null });
  });

  it('throws an EducationApiError with the API message on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Unauthorized', message: 'Sesión vencida' }, { status: 401 }),
        ),
    );

    const error = await fetchEducationCatalog('es').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EducationApiError);
    expect(error).toMatchObject({ message: 'Sesión vencida', status: 401 });
  });

  it('falls back to a translated message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

    await expect(fetchEducationCatalog('es')).rejects.toThrow(
      'No pudimos descargar los artículos. Intenta de nuevo.',
    );
  });

  it('lets a network failure through as is (the hook reads it as "no connection")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));

    const error = await fetchEducationCatalog('es').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(EducationApiError);
  });
});
