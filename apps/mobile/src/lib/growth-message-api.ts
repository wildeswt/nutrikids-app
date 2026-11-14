import { GrowthMessageResponseSchema, type GrowthMessageResponse } from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/**
 * Plain-language growth message for the caregiver (NK-35, RF-14). `status: 'ok'` until the
 * professional has reviewed the alert; the API never returns z-scores or classifications.
 */
export async function fetchGrowthMessage(childId: string): Promise<GrowthMessageResponse> {
  const response = await authFetch(`/children/${childId}/growth-message`);

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:growth.fetch'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return GrowthMessageResponseSchema.parse(rawJson);
}
