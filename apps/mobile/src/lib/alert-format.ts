import i18n from '../i18n/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long ago an alert was created, in plain language ("Hoy", "Ayer", "Hace 3 días"). */
export function formatAlertAge(createdAt: string, now: Date = new Date()): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS));
  if (days === 0) return i18n.t('professional:alerts.today');
  if (days === 1) return i18n.t('common:time.yesterday');
  return i18n.t('common:time.daysAgo', { count: days });
}
