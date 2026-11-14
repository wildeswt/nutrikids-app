import type { EducationalContentResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { DEFAULT_LANGUAGE } from '../i18n/resources.js';
import { EducationApiError, fetchEducationCatalog } from '../lib/education-api.js';
import { readStoredCatalog, writeStoredCatalog } from '../lib/education-storage.js';

export type EducationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  /** The catalog of the language and the base language are both empty. */
  | 'empty'
  /** Nothing saved on the phone and no connection: the caregiver must connect once. */
  | 'needs-connection'
  | 'error';

export interface EducationHookState {
  status: EducationStatus;
  articles: EducationalContentResponse[];
  /** Language of `articles`; differs from the app language when it has no content yet (Kichwa). */
  contentLanguage: string | null;
  /** The articles come from the copy saved on the phone because the refresh failed. */
  offline: boolean;
  error: string | null;
}

interface ResolvedCatalog {
  articles: EducationalContentResponse[];
  offline: boolean;
}

/**
 * Catalog of one language: shows the saved copy right away (`onCached`), then asks the server
 * with `If-None-Match`. A 304 keeps the copy; a new catalog replaces it. When the server cannot
 * be reached the saved copy is returned with `offline: true`; with no saved copy the error is
 * thrown.
 */
async function resolveCatalog(
  language: string,
  onCached: (articles: EducationalContentResponse[]) => void,
): Promise<ResolvedCatalog> {
  const stored = await readStoredCatalog(language);
  if (stored && stored.articles.length > 0) onCached(stored.articles);

  try {
    const result = await fetchEducationCatalog(language, stored?.etag);
    if (result.notModified) {
      return { articles: stored?.articles ?? [], offline: false };
    }
    await writeStoredCatalog(language, { articles: result.articles, etag: result.etag });
    return { articles: result.articles, offline: false };
  } catch (err) {
    if (stored) return { articles: stored.articles, offline: true };
    throw err;
  }
}

/**
 * Educational articles of the app language (RF-18). Kichwa has no content yet, so when its
 * catalog is empty the Spanish one is used and `contentLanguage` says so. The screen calls `load`
 * when it gains focus.
 */
export function useEducation() {
  const [state, setState] = useState<EducationHookState>({
    status: 'idle',
    articles: [],
    contentLanguage: null,
    offline: false,
    error: null,
  });
  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<EducationalContentResponse[] | null> => {
    const requestId = ++latestLoad.current;
    const isCurrent = () => requestId === latestLoad.current;
    const language = i18n.language || DEFAULT_LANGUAGE;
    const languages = language === DEFAULT_LANGUAGE ? [language] : [language, DEFAULT_LANGUAGE];

    setState((prev) => ({
      ...prev,
      status: prev.articles.length === 0 ? 'loading' : prev.status,
      error: null,
    }));

    try {
      let last: { language: string; catalog: ResolvedCatalog } | null = null;
      for (const candidate of languages) {
        const catalog = await resolveCatalog(candidate, (articles) => {
          if (!isCurrent()) return;
          setState((prev) =>
            prev.articles.length > 0
              ? prev
              : { ...prev, status: 'ready', articles, contentLanguage: candidate },
          );
        });
        last = { language: candidate, catalog };
        if (catalog.articles.length > 0) break;
      }

      if (!isCurrent() || !last) return last?.catalog.articles ?? null;
      const { language: contentLanguage, catalog } = last;
      setState({
        status: catalog.articles.length === 0 ? 'empty' : 'ready',
        articles: catalog.articles,
        contentLanguage,
        offline: catalog.offline,
        error: null,
      });
      return catalog.articles;
    } catch (err) {
      if (!isCurrent()) return null;
      // An HTTP error is a server problem; a failed `fetch` (TypeError) means no connection.
      const noConnection = !(err instanceof EducationApiError);
      setState((prev) => ({
        ...prev,
        status: prev.articles.length > 0 ? 'ready' : noConnection ? 'needs-connection' : 'error',
        offline: prev.articles.length > 0,
        error: err instanceof Error ? err.message : i18n.t('errors:education.fetch'),
      }));
      return null;
    }
  }, []);

  return { ...state, load };
}
