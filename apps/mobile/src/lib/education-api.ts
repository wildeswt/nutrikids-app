import {
  EducationalContentResponseSchema,
  type EducationalContentResponse,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** HTTP failure of `GET /education` (a network failure is the `TypeError` thrown by `fetch`). */
export class EducationApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EducationApiError';
    this.status = status;
  }
}

export type EducationCatalogResult =
  /** The server answered 304: the copy saved on the phone is still current. */
  | { notModified: true }
  | { notModified: false; articles: EducationalContentResponse[]; etag: string | null };

/**
 * Downloads the whole catalog of a language (`GET /education?language=`, no `ageMonths`: about 20
 * short articles; the phone filters by age, see docs/feeding-and-education.md). With the `etag`
 * of the saved copy it sends `If-None-Match`, so an unchanged catalog costs a body-less 304.
 */
export async function fetchEducationCatalog(
  language: string,
  etag?: string | null,
): Promise<EducationCatalogResult> {
  const response = await authFetch(`/education?language=${encodeURIComponent(language)}`, {
    headers: etag ? { 'If-None-Match': etag } : {},
  });

  if (response.status === 304) {
    return { notModified: true };
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new EducationApiError(
      parseApiError(payload, i18n.t('errors:education.fetch')).message,
      response.status,
    );
  }

  const rawJson: unknown = await response.json();
  return {
    notModified: false,
    articles: z.array(EducationalContentResponseSchema).parse(rawJson),
    etag: response.headers.get('etag'),
  };
}
