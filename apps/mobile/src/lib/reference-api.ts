import {
  ReferenceCurvesQuerySchema,
  ReferenceCurvesResponseSchema,
  type ReferenceCurvesQuery,
  type ReferenceCurvesResponse,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/**
 * Fetches the WHO reference curves (-3, -2, 0, +2, +3) for an indicator and sex. `position` only
 * matters for weight-for-length/height and selects the length (recumbent) or height (standing)
 * table.
 */
export async function fetchReferenceCurves(
  query: ReferenceCurvesQuery,
): Promise<ReferenceCurvesResponse> {
  const validated = ReferenceCurvesQuerySchema.parse(query);

  const params = new URLSearchParams({ indicator: validated.indicator, sex: validated.sex });
  if (validated.position) {
    params.set('position', validated.position);
  }

  const response = await authFetch(`/reference/curves?${params.toString()}`);

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new Error(parseApiError(payload, i18n.t('errors:reference.fetch')).message);
  }

  const rawJson: unknown = await response.json();
  return ReferenceCurvesResponseSchema.parse(rawJson);
}
