import i18n from '../i18n/index.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Formatea el tiempo transcurrido desde una marca temporal ISO 8601 hasta `now`
 * en minutos, horas o días (p. ej. "5 minutos", "2 horas", "1 día").
 */
export function formatElapsedTime(isoTimestamp: string, now: Date = new Date()): string {
  const targetMs = Date.parse(isoTimestamp);
  const nowMs = now.getTime();
  if (Number.isNaN(targetMs) || Number.isNaN(nowMs)) {
    return i18n.t('common:offline.elapsed.lessThanMinute');
  }

  const diffMs = Math.max(0, nowMs - targetMs);
  const diffMinutes = Math.floor(diffMs / MS_PER_MINUTE);

  if (diffMinutes < 1) {
    return i18n.t('common:offline.elapsed.lessThanMinute');
  }

  if (diffMinutes < 60) {
    return i18n.t('common:offline.elapsed.minutes', { count: diffMinutes });
  }

  const diffHours = Math.floor(diffMs / MS_PER_HOUR);
  if (diffHours < 24) {
    return i18n.t('common:offline.elapsed.hours', { count: diffHours });
  }

  const diffDays = Math.floor(diffMs / MS_PER_DAY);
  return i18n.t('common:offline.elapsed.days', { count: diffDays });
}
