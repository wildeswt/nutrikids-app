import {
  AlertDetailResponseSchema,
  AlertResponseSchema,
  OPEN_ALERT_STATUSES,
  type AlertDetailResponse,
  type AlertResponse,
  type AlertStatus,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Status filters offered as chips in the professional inbox. */
export const ALERT_STATUS_FILTERS = {
  OPEN: OPEN_ALERT_STATUSES,
  ATTENDED: ['REVIEWED', 'FOLLOW_UP_ESTABLISHED'],
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

async function parseDetail(response: Response, fallback: string): Promise<AlertDetailResponse> {
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new Error(parseApiError(payload, fallback).message);
  }
  const rawJson: unknown = await response.json();
  return AlertDetailResponseSchema.parse(rawJson);
}

/** Alert with its status history (`GET /alerts/:alertId`). */
export async function fetchAlertDetail(alertId: string): Promise<AlertDetailResponse> {
  const response = await authFetch(`/alerts/${encodeURIComponent(alertId)}`);
  return parseDetail(response, i18n.t('errors:alerts.detail'));
}

/**
 * Moves an alert to the next status (`PATCH /alerts/:alertId/status`). The API enforces the state
 * machine, so an invalid or concurrent change comes back as an error (409) with its message.
 */
export async function updateAlertStatus(
  alertId: string,
  status: AlertStatus,
): Promise<AlertDetailResponse> {
  const response = await authFetch(`/alerts/${encodeURIComponent(alertId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return parseDetail(response, i18n.t('errors:alerts.review'));
}
