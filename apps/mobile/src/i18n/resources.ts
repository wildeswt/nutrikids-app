import esAuth from './locales/es/auth.json';
import esCaregiver from './locales/es/caregiver.json';
import esCommon from './locales/es/common.json';
import esConsent from './locales/es/consent.json';
import esErrors from './locales/es/errors.json';
import esProfessional from './locales/es/professional.json';
import quAuth from './locales/qu/auth.json';
import quCaregiver from './locales/qu/caregiver.json';
import quCommon from './locales/qu/common.json';
import quConsent from './locales/qu/consent.json';
import quErrors from './locales/qu/errors.json';
import quProfessional from './locales/qu/professional.json';

/**
 * Base language. Every key must exist in Spanish; other languages may be partial and
 * fall back to Spanish for missing keys.
 */
export const DEFAULT_LANGUAGE = 'es' as const;

export const NAMESPACES = [
  'common',
  'auth',
  'caregiver',
  'consent',
  'professional',
  'errors',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

const es = {
  common: esCommon,
  auth: esAuth,
  caregiver: esCaregiver,
  consent: esConsent,
  professional: esProfessional,
  errors: esErrors,
};

/**
 * Kichwa (qu). DRAFT machine translation used as a starting point: it must be reviewed by
 * native speakers before release (see ./locales/qu/README.md). Missing keys fall back to Spanish.
 */
const qu = {
  common: quCommon,
  auth: quAuth,
  caregiver: quCaregiver,
  consent: quConsent,
  professional: quProfessional,
  errors: quErrors,
};

/** Bundled translations. */
export const resources = {
  es,
  qu,
} as const;

export type AppLanguage = keyof typeof resources;

export const SUPPORTED_LANGUAGES = Object.keys(resources) as AppLanguage[];

/**
 * Options shown in the language selector. Each language is named in its own language
 * (autonym), so the name is the same whatever language the app is in.
 * `draft: true` marks translations still pending review by native speakers.
 */
export const LANGUAGE_OPTIONS: ReadonlyArray<{
  code: AppLanguage;
  nativeName: string;
  draft: boolean;
}> = [
  { code: 'es', nativeName: 'Español', draft: false },
  { code: 'qu', nativeName: 'Kichwa', draft: true },
];

/**
 * Locale used by Intl for numeric dates, times and decimals. Device ICU data for `qu` is
 * Peruvian Quechua, not Ecuadorian Kichwa, so Kichwa uses Spanish (Ecuador) numeric formats.
 * Month names are not taken from Intl: they come from `common:date` in the translation files.
 */
export const INTL_LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  es: 'es',
  qu: 'es-EC',
};

export type BaseResources = typeof es;
