import i18n from './index.js';
import { DEFAULT_LANGUAGE, INTL_LOCALE_BY_LANGUAGE, type AppLanguage } from './resources.js';

/**
 * Returns a locale usable by Intl for the active language (see INTL_LOCALE_BY_LANGUAGE),
 * falling back to the base language when the device has no ICU data for it.
 */
function intlLocale(): string {
  const language = (i18n.language || DEFAULT_LANGUAGE) as AppLanguage;
  const locale = INTL_LOCALE_BY_LANGUAGE[language] ?? DEFAULT_LANGUAGE;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0 ? locale : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/** Parses `YYYY-MM-DD` as a local calendar date (avoids UTC day shifts). */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

const MONTH_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;

/**
 * Month names come from the translation files (`common:date.months`), not from the device:
 * phones have no Ecuadorian Kichwa month names (their `qu` data is Peruvian Quechua).
 */
function monthName(date: Date, variant: 'months' | 'monthsShort'): string {
  const key = MONTH_KEYS[date.getMonth()]!;
  return i18n.t(`common:date.${variant}.${key}`);
}

/** Long date, e.g. "18 de octubre de 2026" / "18 wayru killa 2026". */
export function formatLongDate(value: string | Date): string {
  const date = toDate(value);
  return i18n.t('common:date.long', {
    day: date.getDate(),
    month: monthName(date, 'months'),
    year: date.getFullYear(),
  });
}

/** Short date, e.g. "16 oct" / "16 wayru". */
export function formatShortDate(value: string | Date): string {
  const date = toDate(value);
  return i18n.t('common:date.short', {
    day: date.getDate(),
    month: monthName(date, 'monthsShort'),
  });
}

/** Medium date with short month and year, e.g. "18 oct 2026". */
export function formatMediumDate(value: string | Date): string {
  const date = toDate(value);
  return i18n.t('common:date.medium', {
    day: date.getDate(),
    month: monthName(date, 'monthsShort'),
    year: date.getFullYear(),
  });
}

/** Abbreviated month with leading capital for chart X axes, e.g. "Abr" / "Wayru". */
export function formatMonthShort(value: string | Date): string {
  const short = monthName(toDate(value), 'monthsShort');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** Numeric date, e.g. "12-11-2026". */
export function formatNumericDate(value: string | Date): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(value));
}

/** Time of day, e.g. "09:30". */
export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit' }).format(
    toDate(value),
  );
}

/** Decimal number with fixed digits, e.g. 12.2 → "12,2". */
export function formatDecimal(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(intlLocale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Child age from total months, e.g. 41 → "3 años y 5 meses". */
export function formatAge(totalMonths: number): string {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yearsText = i18n.t('common:age.years', { count: years });
  const monthsText = i18n.t('common:age.months', { count: months });
  if (years === 0) return monthsText;
  if (months === 0) return yearsText;
  return i18n.t('common:age.yearsAndMonths', { years: yearsText, months: monthsText });
}

/** Compact age for chart axes, e.g. 39 → "3 años 3m". */
export function formatAgeShort(totalMonths: number): string {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yearsText = i18n.t('common:age.years', { count: years });
  if (months === 0) return yearsText;
  return i18n.t('common:age.yearsAndMonthsShort', { years: yearsText, months });
}
