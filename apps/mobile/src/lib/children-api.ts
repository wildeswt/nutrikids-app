import {
  ChildResponseSchema,
  CreateChildInputSchema,
  completedMonths,
  todayIsoDate,
  type ChildResponse,
  type CreateChildInput,
} from '@nutrikids/shared';
import { z } from 'zod';
import { formatAge } from '../i18n/format.js';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

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
    throw new Error(parsed.message);
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
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ChildResponseSchema.parse(rawJson);
}

/** One linked child (`GET /children/:childId`): name, birth date and sex. */
export async function fetchChild(childId: string): Promise<ChildResponse> {
  const response = await authFetch(`/children/${childId}`);

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new Error(parseApiError(payload, i18n.t('errors:children.fetch')).message);
  }

  const rawJson: unknown = await response.json();
  return ChildResponseSchema.parse(rawJson);
}
