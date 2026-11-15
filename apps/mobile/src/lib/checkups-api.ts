import {
  CaregiverCheckupResponseSchema,
  CheckupResponseSchema,
  CreateCheckupInputSchema,
  type CaregiverCheckupResponse,
  type CheckupResponse,
  type CreateCheckupInput,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Error returned by the checkups endpoints, keeping the HTTP status so screens can react to it. */
export class CheckupApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CheckupApiError';
    this.status = status;
  }
}

/**
 * `true` when the API rejected the checkup because the child has no active informed consent
 * (403). The API sends no error code, so the status is combined with the message text; other
 * 403s (role, link) do not mention the consent.
 */
export function isConsentRequiredError(err: unknown): boolean {
  return (
    err instanceof CheckupApiError && err.status === 403 && /consentimiento/i.test(err.message)
  );
}

async function toApiError(response: Response, fallback: string): Promise<CheckupApiError> {
  const payload: unknown = await response.json().catch(() => ({}));
  return new CheckupApiError(parseApiError(payload, fallback).message, response.status);
}

/**
 * Lists the current checkups of a child, newest first (RF-14: the caregiver view has no z-scores,
 * percentiles or classifications). Replaced checkups are left out with `onlyCurrent=true`.
 */
export async function fetchChildCheckups(childId: string): Promise<CaregiverCheckupResponse[]> {
  const response = await authFetch(`/children/${childId}/checkups?onlyCurrent=true`);

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:checkups.fetch'));
  }

  const rawJson: unknown = await response.json();
  return z.array(CaregiverCheckupResponseSchema).parse(rawJson);
}

/**
 * Full checkup history of a child for the professional view, newest first, with the 4 technical
 * results of each checkup (z-score, percentile, classification). Corrected checkups are included
 * so an alert raised by one of them can still be located.
 */
export async function fetchProfessionalCheckups(childId: string): Promise<CheckupResponse[]> {
  const response = await authFetch(`/children/${childId}/checkups`);

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:checkups.fetch'));
  }

  const rawJson: unknown = await response.json();
  return z.array(CheckupResponseSchema).parse(rawJson);
}

/**
 * Corrects a checkup (`POST /checkups/:id/correction`): the server stores a new checkup that
 * replaces the original one. Needs a connection (not queued offline).
 */
export async function correctChildCheckup(
  checkupId: string,
  input: CreateCheckupInput,
): Promise<CaregiverCheckupResponse> {
  const validatedBody = CreateCheckupInputSchema.parse(input);

  const response = await authFetch(`/checkups/${checkupId}/correction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validatedBody),
  });

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:checkups.create'));
  }

  const rawJson: unknown = await response.json();
  return CaregiverCheckupResponseSchema.parse(rawJson);
}

/** Soft-deletes a checkup (`DELETE /checkups/:id`): it stops showing but stays for audit. */
export async function deleteChildCheckup(checkupId: string): Promise<void> {
  const response = await authFetch(`/checkups/${checkupId}`, { method: 'DELETE' });

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:checkups.delete'));
  }
}

/**
 * Registers a checkup for a child. The body is validated with `CreateCheckupInputSchema`; the
 * server recalculates everything and returns the stored checkup (201, or 200 when the same `id`
 * was already saved).
 */
export async function createChildCheckup(
  childId: string,
  input: CreateCheckupInput,
): Promise<CaregiverCheckupResponse> {
  const validatedBody = CreateCheckupInputSchema.parse(input);

  const response = await authFetch(`/children/${childId}/checkups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validatedBody),
  });

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:checkups.create'));
  }

  const rawJson: unknown = await response.json();
  return CaregiverCheckupResponseSchema.parse(rawJson);
}
