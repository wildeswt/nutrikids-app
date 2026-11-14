import type { AccountResponse } from '@nutrikids/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authFetchMock = vi.fn();

vi.mock('../lib/api.js', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
  parseApiError: (payload: { message?: string }, fallback: string) => ({
    message: payload?.message ?? fallback,
  }),
}));

import {
  AccountApiError,
  fetchAccount,
  isEmailTakenError,
  isWrongPasswordError,
  updateAccount,
} from '../lib/account-api.js';
import { accountToFormValues, buildAccountUpdate, emailChanged } from '../lib/account-form.js';

const account: AccountResponse = {
  id: '3f1c0f9e-6a53-4f0e-9a64-0d3a3d3c6b11',
  email: 'andrea@example.com',
  firstName: 'Andrea',
  lastName: 'Silva',
  phone: '+593 99 000 0000',
};

describe('account form', () => {
  it('sends only what changed', () => {
    const values = { ...accountToFormValues(account), firstName: ' Andreína ' };
    const result = buildAccountUpdate(values, account);

    expect(result.input).toEqual({ firstName: 'Andreína' });
  });

  it('asks for the current password when the email changes', () => {
    const values = { ...accountToFormValues(account), email: 'Nueva@Example.com' };
    expect(emailChanged(values, account)).toBe(true);

    const withoutPassword = buildAccountUpdate(values, account);
    expect(withoutPassword.errors?.currentPassword).toBeDefined();

    const withPassword = buildAccountUpdate({ ...values, currentPassword: 'secreto-123' }, account);
    expect(withPassword.input).toEqual({
      email: 'nueva@example.com',
      currentPassword: 'secreto-123',
    });
  });

  it('does not treat a different case of the same email as a change', () => {
    const values = { ...accountToFormValues(account), email: 'ANDREA@example.com' };
    expect(emailChanged(values, account)).toBe(false);
    expect(buildAccountUpdate(values, account).errors).toBeDefined(); // nothing to change
  });

  it('reports invalid values per field and an empty change', () => {
    const base = accountToFormValues(account);
    expect(
      buildAccountUpdate({ ...base, firstName: '   ' }, account).errors?.firstName,
    ).toBeDefined();
    expect(buildAccountUpdate({ ...base, phone: 'llámame' }, account).errors?.phone).toBeDefined();
    expect(
      buildAccountUpdate({ ...base, email: 'no-es-correo', currentPassword: 'x' }, account).errors
        ?.email,
    ).toBeDefined();
    expect(buildAccountUpdate(base, account).errors).toBeDefined();
  });

  it('allows clearing the phone', () => {
    const result = buildAccountUpdate({ ...accountToFormValues(account), phone: '' }, account);
    expect(result.input).toEqual({ phone: '' });
  });
});

describe('account api', () => {
  beforeEach(() => authFetchMock.mockReset());

  it('fetches the account', async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => account });
    expect(await fetchAccount()).toEqual(account);
    expect(authFetchMock).toHaveBeenCalledWith('/account');
  });

  it('patches only the given fields', async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => account });
    await updateAccount({ firstName: 'Andreína' });

    const [path, init] = authFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/account');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ firstName: 'Andreína' });
  });

  it('keeps the HTTP status so the form can tell a wrong password from a taken email', async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'no' }),
    });
    const wrong = await updateAccount({ email: 'a@b.co', currentPassword: 'x' }).catch(
      (e: unknown) => e,
    );
    expect(wrong).toBeInstanceOf(AccountApiError);
    expect(isWrongPasswordError(wrong)).toBe(true);
    expect(isEmailTakenError(wrong)).toBe(false);

    authFetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    const taken = await updateAccount({ email: 'a@b.co', currentPassword: 'x' }).catch(
      (e: unknown) => e,
    );
    expect(isEmailTakenError(taken)).toBe(true);
  });

  it('rejects a response that does not match the contract', async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'x' }) });
    await expect(fetchAccount()).rejects.toThrow();
  });
});
