import {
  ProfessionalAssignmentResponseSchema,
  ProfessionalLookupResponseSchema,
  UuidSchema,
  type ProfessionalAssignmentResponse,
  type ProfessionalLookupResponse,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Error de la API de profesionales que conserva el código HTTP (0 = sin conexión). */
export class ProfessionalApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProfessionalApiError';
    this.status = status;
  }
}

/** Mensaje claro según el código HTTP; el resto usa el texto de la API o el genérico. */
function messageForStatus(status: number, apiMessage: string, fallback: string): string {
  switch (status) {
    case 429:
      return i18n.t('errors:professionals.tooManyLookups');
    case 404:
      return i18n.t('errors:professionals.notFound');
    default:
      return apiMessage || fallback;
  }
}

async function request(
  path: string,
  init: RequestInit | undefined,
  fallback: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await authFetch(path, init);
  } catch {
    throw new ProfessionalApiError(i18n.t('errors:network'), 0);
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, fallback);
    throw new ProfessionalApiError(
      messageForStatus(response.status, parsed.message, fallback),
      response.status,
    );
  }
  return response.json();
}

/** Busca un profesional por su registro (`GET /professionals/lookup`). */
export async function lookupProfessional(license: string): Promise<ProfessionalLookupResponse> {
  const trimmed = license.trim();
  const raw = await request(
    `/professionals/lookup?license=${encodeURIComponent(trimmed)}`,
    undefined,
    i18n.t('errors:professionals.lookup'),
  );
  return ProfessionalLookupResponseSchema.parse(raw);
}

/** Vincula un profesional al niño (`POST /children/:childId/professionals`). */
export async function linkProfessional(
  childId: string,
  professionalId: string,
): Promise<ProfessionalAssignmentResponse> {
  const raw = await request(
    `/children/${encodeURIComponent(UuidSchema.parse(childId))}/professionals`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professionalId: UuidSchema.parse(professionalId) }),
    },
    i18n.t('errors:professionals.link'),
  );
  return ProfessionalAssignmentResponseSchema.parse(raw);
}

/** Lista los vínculos del niño (`GET /children/:childId/professionals`). */
export async function listLinkedProfessionals(
  childId: string,
): Promise<ProfessionalAssignmentResponse[]> {
  const raw = await request(
    `/children/${encodeURIComponent(UuidSchema.parse(childId))}/professionals`,
    undefined,
    i18n.t('errors:professionals.list'),
  );
  return z.array(ProfessionalAssignmentResponseSchema).parse(raw);
}

/**
 * Termina el vínculo con el profesional ya (`PATCH …/professionals/:id/end`). El vínculo está
 * vigente hasta el día de `endDate` inclusive, así que se cierra con la fecha de ayer.
 */
export async function unlinkProfessional(
  childId: string,
  professionalId: string,
): Promise<ProfessionalAssignmentResponse> {
  const raw = await request(
    `/children/${encodeURIComponent(UuidSchema.parse(childId))}/professionals/${encodeURIComponent(
      UuidSchema.parse(professionalId),
    )}/end`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      }),
    },
    i18n.t('errors:professionals.unlink'),
  );
  return ProfessionalAssignmentResponseSchema.parse(raw);
}

/** Iniciales para el avatar (primera letra del nombre y del apellido). */
export function professionalInitials(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}
