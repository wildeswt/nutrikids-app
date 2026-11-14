import {
  ChildResponseSchema,
  ErasureRequestResponseSchema,
  RectifyChildInputSchema,
  type ChildResponse,
  type ErasureRequestResponse,
  type RectifyChildInput,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Error returned by the data-rights endpoints, keeping the HTTP status so screens can react. */
export class DataRightsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DataRightsApiError';
    this.status = status;
  }
}

/**
 * `true` when the API refused because the user is not the legal representative of the child
 * (403): these rights are only for the representative, other caregivers get this answer.
 */
export function isNotLegalRepresentativeError(err: unknown): boolean {
  return err instanceof DataRightsApiError && err.status === 403;
}

/** `true` when the birth date or sex can no longer change because the child has checkups (409). */
export function isIdentityLockedError(err: unknown): boolean {
  return err instanceof DataRightsApiError && err.status === 409;
}

async function toApiError(response: Response, fallback: string): Promise<DataRightsApiError> {
  const payload: unknown = await response.json().catch(() => ({}));
  return new DataRightsApiError(parseApiError(payload, fallback).message, response.status);
}

/**
 * The part of the export the app reads (`GET /children/:childId/export` returns more: caregivers,
 * consents, feeding logs, follow-ups and reminders). Unknown fields are dropped on purpose.
 */
export const ChildExportSchema = z.object({
  exportedAt: z.string(),
  child: ChildResponseSchema,
  checkups: z.array(
    z.object({
      id: z.string(),
      measuredAt: z.string(),
      weightKg: z.string(),
      lengthHeightCm: z.string(),
      position: z.string(),
      origin: z.string(),
      correctedCheckupId: z.string().nullable(),
    }),
  ),
});

export type ChildExport = z.infer<typeof ChildExportSchema>;

/** Rectifies the identity of a child (`PATCH /children/:childId`, legal representative only). */
export async function rectifyChild(
  childId: string,
  input: RectifyChildInput,
): Promise<ChildResponse> {
  const validatedBody = RectifyChildInputSchema.parse(input);

  const response = await authFetch(`/children/${childId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validatedBody),
  });
  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:dataRights.rectify'));
  }

  const rawJson: unknown = await response.json();
  return ChildResponseSchema.parse(rawJson);
}

/** Downloads the data of a child (`GET /children/:childId/export`, legal representative only). */
export async function fetchChildExport(childId: string): Promise<ChildExport> {
  const response = await authFetch(`/children/${childId}/export`);
  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:dataRights.export'));
  }

  const rawJson: unknown = await response.json();
  return ChildExportSchema.parse(rawJson);
}

/** Requests the deletion of a child's data (`POST …/erasure-requests`; 409 if one is pending). */
export async function requestErasure(childId: string): Promise<ErasureRequestResponse> {
  const response = await authFetch(`/children/${childId}/erasure-requests`, { method: 'POST' });
  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:dataRights.erasureRequest'));
  }

  const rawJson: unknown = await response.json();
  return ErasureRequestResponseSchema.parse(rawJson);
}

/** History of deletion requests of a child, newest first (legal representative only). */
export async function fetchErasureRequests(childId: string): Promise<ErasureRequestResponse[]> {
  const response = await authFetch(`/children/${childId}/erasure-requests`);
  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:dataRights.erasureList'));
  }

  const rawJson: unknown = await response.json();
  return z.array(ErasureRequestResponseSchema).parse(rawJson);
}

/** Cancels a pending deletion request (`DELETE …/erasure-requests/:requestId`). */
export async function cancelErasureRequest(
  childId: string,
  requestId: string,
): Promise<ErasureRequestResponse> {
  const response = await authFetch(`/children/${childId}/erasure-requests/${requestId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:dataRights.erasureCancel'));
  }

  const rawJson: unknown = await response.json();
  return ErasureRequestResponseSchema.parse(rawJson);
}
