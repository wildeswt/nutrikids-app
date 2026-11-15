import {
  RecoveryCodesResponseSchema,
  RegenerateRecoveryCodesInputSchema,
  TwoFactorStatusSchema,
  type TwoFactorStatus,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Error of the two-factor endpoints, keeping the HTTP status (401 = wrong or reused code). */
export class TwoFactorApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TwoFactorApiError';
    this.status = status;
  }
}

async function toApiError(response: Response, fallback: string): Promise<TwoFactorApiError> {
  const payload: unknown = await response.json().catch(() => ({}));
  return new TwoFactorApiError(parseApiError(payload, fallback).message, response.status);
}

/** Whether two-factor is enabled and how many recovery codes are left (NK-10). */
export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const response = await authFetch('/auth/2fa/status');
  if (!response.ok) throw await toApiError(response, i18n.t('errors:twoFactor.status'));
  return TwoFactorStatusSchema.parse(await response.json());
}

/** Replaces the recovery codes (the old ones stop working). Needs a current TOTP code. */
export async function regenerateRecoveryCodes(totpCode: string): Promise<string[]> {
  const body = RegenerateRecoveryCodesInputSchema.parse({ totpCode });
  const response = await authFetch('/auth/2fa/recovery-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await toApiError(response, i18n.t('errors:twoFactor.regenerate'));
  return RecoveryCodesResponseSchema.parse(await response.json()).recoveryCodes;
}

export function isInvalidTotpError(err: unknown): boolean {
  return err instanceof TwoFactorApiError && err.status === 401;
}
