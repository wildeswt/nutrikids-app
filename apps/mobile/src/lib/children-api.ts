import {
  ChildResponseSchema,
  CreateChildInputSchema,
  completedMonths,
  todayIsoDate,
  type ChildResponse,
  type CreateChildInput,
} from '@nutrikids/shared';
import { z } from 'zod';
import { authFetch, parseApiError } from './api.js';

/**
 * Formatea la edad del niño en años y meses en lenguaje claro para el cuidador.
 */
export function formatChildAge(birthDate: string): string {
  const totalMonths = completedMonths(birthDate, todayIsoDate());
  if (totalMonths < 0) return 'Recién nacido';
  const years = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;

  if (years === 0) {
    return `${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'}`;
  }
  if (remainingMonths === 0) {
    return `${years} ${years === 1 ? 'año' : 'años'}`;
  }
  return `${years} ${years === 1 ? 'año' : 'años'} y ${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'}`;
}

/**
 * Consulta la lista de niños asociados al cuidador autenticado.
 */
export async function fetchCaregiverChildren(): Promise<ChildResponse[]> {
  const response = await authFetch('/children');

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, 'No se pudo obtener la lista de niños');
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return z.array(ChildResponseSchema).parse(rawJson);
}

/**
 * Registra un nuevo niño asociado al cuidador autenticado (RF-03, RF-14).
 * Valida los datos de entrada con CreateChildInputSchema de @nutrikids/shared.
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
    const parsed = parseApiError(payload, 'No se pudo registrar al niño');
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ChildResponseSchema.parse(rawJson);
}
