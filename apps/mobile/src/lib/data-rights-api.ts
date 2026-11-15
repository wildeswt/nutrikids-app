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
import { historyFileName } from './history-export.js';

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

/**
 * Downloads the history of a child as an Excel workbook (`GET /children/:childId/export.xlsx`,
 * legal representative only). Returns the bytes and the file name chosen by the API.
 */
export async function fetchChildWorkbook(
  childId: string,
): Promise<{ fileName: string; data: ArrayBuffer }> {
  const response = await authFetch(`/children/${childId}/export.xlsx`);
  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:dataRights.export'));
  }

  return {
    fileName: historyFileName(response.headers.get('Content-Disposition')),
    data: await response.arrayBuffer(),
  };
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

/** Soft-deletes the child (`DELETE /children/:childId`, legal representative only). */
export async function removeChild(childId: string): Promise<void> {
  const response = await authFetch(`/children/${childId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:dataRights.removeChild'));
  }
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
