import {
  AccountResponseSchema,
  type AccountResponse,
  type UpdateAccountInput,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/** Error of the account endpoints, keeping the HTTP status so the form can react. */
export class AccountApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
  }
}

async function toApiError(response: Response, fallback: string): Promise<AccountApiError> {
  const payload: unknown = await response.json().catch(() => ({}));
  return new AccountApiError(parseApiError(payload, fallback).message, response.status);
}

/** Name, email and contact phone of the signed-in user (NK-55). */
export async function fetchAccount(): Promise<AccountResponse> {
  const response = await authFetch('/account');
  if (!response.ok) throw await toApiError(response, i18n.t('errors:account.fetch'));
  return AccountResponseSchema.parse(await response.json());
}

/** Changes name, email or phone. Changing the email needs the current password. */
export async function updateAccount(input: UpdateAccountInput): Promise<AccountResponse> {
  const response = await authFetch('/account', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response, i18n.t('errors:account.update'));
  return AccountResponseSchema.parse(await response.json());
}

/** `403` when the current password is wrong, `409` when the email is already registered. */
export function isWrongPasswordError(err: unknown): boolean {
  return err instanceof AccountApiError && err.status === 403;
}

export function isEmailTakenError(err: unknown): boolean {
  return err instanceof AccountApiError && err.status === 409;
}
