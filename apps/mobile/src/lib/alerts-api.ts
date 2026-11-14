import {
  AlertResponseSchema,
  OPEN_ALERT_STATUSES,
  type AlertResponse,
  type AlertStatus,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Status filters offered as chips in the professional inbox. */
export const ALERT_STATUS_FILTERS = {
  OPEN: OPEN_ALERT_STATUSES,
  GENERATED: ['GENERATED'],
  PENDING_REVIEW: ['PENDING_REVIEW'],
} as const satisfies Record<string, readonly AlertStatus[]>;

export type AlertStatusFilter = keyof typeof ALERT_STATUS_FILTERS;

export interface FetchAlertsParams {
  /** Defaults to the open (unreviewed) statuses. */
  statuses?: readonly AlertStatus[];
  childId?: string;
}

/**
 * Fetches the professional's alert inbox (`GET /alerts`). The server already orders the list by
 * severity, risk type and age, so callers must keep the returned order.
 */
export async function fetchAlerts(params: FetchAlertsParams = {}): Promise<AlertResponse[]> {
  const { statuses = OPEN_ALERT_STATUSES, childId } = params;
  // Enum values are URL-safe; the API accepts the comma-separated form.
  let query = `status=${statuses.join(',')}`;
  if (childId) query += `&childId=${encodeURIComponent(childId)}`;

  const response = await authFetch(`/alerts?${query}`);

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:alerts.list'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return z.array(AlertResponseSchema).parse(rawJson);
}
