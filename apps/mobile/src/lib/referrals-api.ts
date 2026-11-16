import {
  CreateReferralInputSchema,
  MessageResponseSchema,
  ProfessionalAssignmentResponseSchema,
  type CreateReferralInput,
  type MessageResponse,
  type ProfessionalAssignmentResponse,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

export { fetchCaregiverChildren as fetchMyChildren } from './children-api.js';

/** Error devuelto por los endpoints de interconsultas; conserva el estado HTTP (0 para red). */
export class ReferralApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ReferralApiError';
    this.status = status;
  }
}

/** `true` cuando la petición falló por falta de conexión o tiempo de espera. */
export function isReferralNetworkError(err: unknown): boolean {
  if (err instanceof ReferralApiError) return err.status === 0;
  return (
    err instanceof TypeError ||
    (err instanceof Error && (err.name === 'AbortError' || /network|fetch/i.test(err.message)))
  );
}

/** `true` cuando la API rechazó la interconsulta con 403 (sin vínculo, sin consentimiento o sin rol). */
export function isReferralForbiddenError(err: unknown): boolean {
  return err instanceof ReferralApiError && err.status === 403;
}

async function toApiError(response: Response, fallback: string): Promise<ReferralApiError> {
  const payload: unknown = await response.json().catch(() => ({}));
  return new ReferralApiError(parseApiError(payload, fallback).message, response.status);
}

async function safeAuthFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  try {
    return await authFetch(endpoint, init);
  } catch (err) {
    if (isReferralNetworkError(err)) {
      throw new ReferralApiError(i18n.t('errors:referrals.network'), 0);
    }
    throw err;
  }
}

/**
 * Lista los vínculos `atiende` del niño (`GET /children/:childId/professionals`).
 * Incluye asignaciones vigentes e históricas; la pantalla filtra las vigentes hoy y excluye al usuario.
 */
export async function fetchChildProfessionals(
  childId: string,
): Promise<ProfessionalAssignmentResponse[]> {
  const response = await safeAuthFetch(`/children/${encodeURIComponent(childId)}/professionals`);

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:referrals.professionals'));
  }

  const rawJson: unknown = await response.json();
  return z.array(ProfessionalAssignmentResponseSchema).parse(rawJson);
}

/**
 * Envía una interconsulta (`POST /referrals`). Idempotente por `id` generado en el cliente:
 * reenviar el mismo contenido con el mismo `id` devuelve 200 sin duplicar la derivación.
 */
export async function createReferral(input: CreateReferralInput): Promise<MessageResponse> {
  const validatedBody = CreateReferralInputSchema.parse(input);

  const response = await safeAuthFetch('/referrals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validatedBody),
  });

  if (!response.ok) {
    const fallback =
      response.status === 403
        ? i18n.t('errors:referrals.forbidden')
        : i18n.t('errors:referrals.create');
    throw await toApiError(response, fallback);
  }

  const rawJson: unknown = await response.json();
  return MessageResponseSchema.parse(rawJson);
}
