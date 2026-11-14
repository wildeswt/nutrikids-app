import type { EducationalContentResponse, EducationQuery } from '@nutrikids/shared';
import { prisma } from '../lib/prisma.js';

/**
 * Educational articles of a language, optionally only those whose age range contains `ageMonths`
 * (`minAgeMonths <= ageMonths <= maxAgeMonths`). Public reference data: not child-scoped and not
 * protected by RLS, so it is read with the plain client. Ordered by age range, then title.
 */
export async function listEducationalContent(
  query: EducationQuery,
): Promise<EducationalContentResponse[]> {
  const { ageMonths, language } = query;
  return prisma.educationalContent.findMany({
    where: {
      language,
      ...(ageMonths === undefined
        ? {}
        : { minAgeMonths: { lte: ageMonths }, maxAgeMonths: { gte: ageMonths } }),
    },
    orderBy: [{ minAgeMonths: 'asc' }, { maxAgeMonths: 'asc' }, { title: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      body: true,
      minAgeMonths: true,
      maxAgeMonths: true,
      language: true,
    },
  });
}
