import {
  CaregiverAssignmentResponseSchema,
  ChildResponseSchema,
  CreateChildInputSchema,
  completedMonths,
  todayIsoDate,
  type CaregiverAssignmentResponse,
  type ChildResponse,
  type CreateChildInput,
} from '@nutrikids/shared';
import { z } from 'zod';
import { formatAge } from '../i18n/format.js';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Error de la API de niños que conserva el código HTTP para distinguir 401/403/404 de 5xx. */
export class ChildApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ChildApiError';
    this.status = status;
  }
}

/**
 * Child age in years and months in plain language for the caregiver (e.g. "3 años y 5 meses").
 * Delegates to the shared i18n `formatAge` so the text follows the active language.
 */
export function formatChildAge(birthDate: string): string {
  const totalMonths = completedMonths(birthDate, todayIsoDate());
  if (totalMonths < 0) return i18n.t('common:age.newborn');
  return formatAge(totalMonths);
}

/**
 * Fetches the children linked to the authenticated caregiver.
 */
export async function fetchCaregiverChildren(): Promise<ChildResponse[]> {
  const response = await authFetch('/children');

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:consent.childList'));
    throw new ChildApiError(parsed.message, response.status);
  }

  const rawJson: unknown = await response.json();
  return z.array(ChildResponseSchema).parse(rawJson);
}

/**
 * Registers a new child linked to the authenticated caregiver (RF-03, RF-14).
 * Validates the input with CreateChildInputSchema from @nutrikids/shared.
 */
export async function createChild(input: CreateChildInput): Promise<ChildResponse> {
  const validatedBody = CreateChildInputSchema.parse(input);

  const response = await authFetch('/children', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validatedBody),
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:children.create'));
    throw new ChildApiError(parsed.message, response.status);
  }

  const rawJson: unknown = await response.json();
  return ChildResponseSchema.parse(rawJson);
}

/** One linked child (`GET /children/:childId`): name, birth date and sex. */
export async function fetchChild(childId: string): Promise<ChildResponse> {
  const response = await authFetch(`/children/${childId}`);

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new ChildApiError(
      parseApiError(payload, i18n.t('errors:children.fetch')).message,
      response.status,
    );
  }

  const rawJson: unknown = await response.json();
  return ChildResponseSchema.parse(rawJson);
}

/** Linked caregivers for a child (`GET /children/:childId/caregivers`). */
export async function fetchChildCaregivers(
  childId: string,
): Promise<CaregiverAssignmentResponse[]> {
  const response = await authFetch(`/children/${encodeURIComponent(childId)}/caregivers`);

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new ChildApiError(
      parseApiError(payload, i18n.t('errors:children.fetch')).message,
      response.status,
    );
  }

  const rawJson: unknown = await response.json();
  return z.array(CaregiverAssignmentResponseSchema).parse(rawJson);
}
