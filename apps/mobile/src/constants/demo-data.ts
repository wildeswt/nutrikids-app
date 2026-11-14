/**
 * Demo data shown while the remaining caregiver home cards are not yet connected to the API.
 *
 * This file holds DATA only (proper names, numbers, ISO dates and sample messages that in
 * production are written by users). Every interface label that surrounds this data lives in
 * the translation files under `src/i18n/locales`.
 */

export interface DemoChild {
  id: string;
  firstName: string;
  fullName: string;
  /** ISO date `YYYY-MM-DD`. */
  birthDate: string;
  ageMonths: number;
}

export const DEMO_ACTIVE_CHILD: DemoChild = {
  id: 'mateo-1',
  firstName: 'Mateo',
  fullName: 'Mateo José Rodríguez',
  birthDate: '2023-05-12',
  ageMonths: 41,
};

export const DEMO_HOME_MESSAGE = {
  content: 'Sigamos ofreciendo agua durante el día',
  authorName: 'Dra. Carolina Díaz',
  daysAgo: 2,
};

export const DEMO_NEXT_CHECKUP = {
  date: '2026-11-24',
  place: 'Centro de Salud La Esperanza',
  time: '09:30',
};
