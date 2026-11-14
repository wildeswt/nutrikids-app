import { GrowthTrendResponseSchema, type GrowthTrendResponse } from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

export class GrowthTrendApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GrowthTrendApiError';
    this.status = status;
  }
}

async function toApiError(response: Response, fallback: string): Promise<GrowthTrendApiError> {
  const payload: unknown = await response.json().catch(() => ({}));
  return new GrowthTrendApiError(parseApiError(payload, fallback).message, response.status);
}

/**
 * Consulta la tendencia de crecimiento por indicador para el cuidador (NK-74).
 * Valida la respuesta con GrowthTrendResponseSchema.
 * Sin valores técnicos (RF-14).
 */
export async function fetchGrowthTrend(childId: string): Promise<GrowthTrendResponse> {
  const response = await authFetch(`/children/${childId}/growth-trend`);

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:growthTrend.fetch'));
  }

  const rawJson: unknown = await response.json();
  return GrowthTrendResponseSchema.parse(rawJson);
}
