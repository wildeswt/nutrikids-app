import {
  CreateFollowUpBatchInputSchema,
  CreateFollowUpInputSchema,
  FollowUpBatchResponseSchema,
  FollowUpResponseSchema,
  type CreateFollowUpBatchInput,
  type CreateFollowUpInput,
  type FollowUpBatchResponse,
  type FollowUpResponse,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** The request never reached the server (no connection, timeout): it is safe to retry later. */
export class FollowUpOfflineError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(i18n.t('errors:network'), options);
    this.name = 'FollowUpOfflineError';
  }
}

/** The server answered with an error; `status` tells whether retrying could help. */
export class FollowUpApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'FollowUpApiError';
    this.status = status;
  }
}

/**
 * Registers a follow-up for a child (`POST /children/:childId/follow-ups`, RF-15). The `id` comes
 * from the client, so sending the same follow-up twice returns it (200) instead of duplicating it.
 * A failed `fetch` (no response at all) becomes `FollowUpOfflineError`.
 */
export async function createFollowUp(
  childId: string,
  input: CreateFollowUpInput,
): Promise<FollowUpResponse> {
  const validatedBody = CreateFollowUpInputSchema.parse(input);

  let response: Response;
  try {
    response = await authFetch(`/children/${encodeURIComponent(childId)}/follow-ups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validatedBody),
    });
  } catch (err) {
    throw new FollowUpOfflineError({ cause: err });
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:followUps.create'));
    throw new FollowUpApiError(parsed.message, response.status);
  }

  const rawJson: unknown = await response.json();
  return FollowUpResponseSchema.parse(rawJson);
}

/**
 * Registers a batch of clinical follow-ups for a child (`POST /children/:childId/follow-ups/batch`, NK-75).
 * Atomically links 1 to 3 items under the same group_id. Idempotent by item client-generated ids.
 */
export async function createFollowUpBatch(
  childId: string,
  input: CreateFollowUpBatchInput,
): Promise<FollowUpBatchResponse> {
  const validatedBody = CreateFollowUpBatchInputSchema.parse(input);

  let response: Response;
  try {
    response = await authFetch(`/children/${encodeURIComponent(childId)}/follow-ups/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validatedBody),
    });
  } catch (err) {
    throw new FollowUpOfflineError({ cause: err });
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:followUps.create'));
    throw new FollowUpApiError(parsed.message, response.status);
  }

  const rawJson: unknown = await response.json();
  return FollowUpBatchResponseSchema.parse(rawJson);
}
