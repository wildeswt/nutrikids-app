import {
  completedMonths,
  todayIsoDate,
  type ChildResponse,
  type EducationalContentResponse,
} from '@nutrikids/shared';

/** Reading speed used for the "se lee en N minutos" label (words per minute, plain Spanish). */
const WORDS_PER_MINUTE = 180;

/** Age of a child in completed months today (never negative). */
export function childAgeMonths(child: Pick<ChildResponse, 'birthDate'>): number {
  return Math.max(0, completedMonths(child.birthDate, todayIsoDate()));
}

/**
 * Articles written for an age in months (both ends of the range are inclusive). The catalog is
 * downloaded whole, so the age filter runs on the phone.
 */
export function filterByAge(
  articles: EducationalContentResponse[],
  ageMonths: number,
): EducationalContentResponse[] {
  return articles.filter(
    (article) => article.minAgeMonths <= ageMonths && ageMonths <= article.maxAgeMonths,
  );
}

/** Minutes needed to read an article (at least 1). */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** Paragraphs of an article body (separated by blank lines; a body with one block is one paragraph). */
export function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** First characters of the body for the list, cut at a word and ended with an ellipsis. */
export function articlePreview(body: string, maxLength = 110): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trimEnd()}…`;
}
