import {
  ConsentResponseSchema,
  GrantConsentInputSchema,
  type ConsentResponse,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Versión actual del texto de consentimiento informado para la app. */
export const CURRENT_CONSENT_VERSION = 'v1';

/**
 * Returns the informed consent text for a version from the translation files
 * (`consent:documents.<version>`), falling back to the current version if it does not exist.
 *
 * Important: the text of a published version must never change. To change the content, create
 * a new version (e.g. `v2`) and update `CURRENT_CONSENT_VERSION`.
 */
export function getConsentText(version: string): string {
  const key = `documents.${version}`;
  if (i18n.exists(key, { ns: 'consent' })) {
    return i18n.t(key as 'documents.v1', { ns: 'consent' });
  }
  return i18n.t(`documents.${CURRENT_CONSENT_VERSION}` as 'documents.v1', { ns: 'consent' });
}

/**
 * Consulta el consentimiento informado vigente o más reciente para un niño.
 * Retorna `null` si aún no existe consentimiento registrado (HTTP 404).
 */
export async function fetchConsentForChild(childId: string): Promise<ConsentResponse | null> {
  const response = await authFetch(`/children/${childId}/consent`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:consent.fetch'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ConsentResponseSchema.parse(rawJson);
}

/**
 * Otorga o renueva el consentimiento informado de un niño con una versión de texto específica.
 */
export async function grantConsentForChild(
  childId: string,
  textVersion: string = CURRENT_CONSENT_VERSION,
): Promise<ConsentResponse> {
  const validatedBody = GrantConsentInputSchema.parse({ textVersion });

  const response = await authFetch(`/children/${childId}/consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validatedBody),
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:consent.grant'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ConsentResponseSchema.parse(rawJson);
}

/**
 * Revoca el consentimiento informado vigente de un niño (revocación lógica con trazabilidad).
 */
export async function revokeConsentForChild(childId: string): Promise<ConsentResponse> {
  const response = await authFetch(`/children/${childId}/consent`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:consent.revoke'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ConsentResponseSchema.parse(rawJson);
}

export { fetchCaregiverChildren } from './children-api.js';
