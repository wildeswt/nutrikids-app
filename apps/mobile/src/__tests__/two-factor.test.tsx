import type { AuthResponse } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authFetchMock = vi.fn();

vi.mock('../lib/api.js', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
  parseApiError: (payload: { message?: string }, fallback: string) => ({
    message: payload?.message ?? fallback,
  }),
}));

import { TwoFactorEnrollment } from '../components/auth/TwoFactorEnrollment.js';
import { RecoveryCodesList } from '../components/RecoveryCodesList.js';
import { TwoFactorCard } from '../components/TwoFactorCard.js';
import { formatManualKey, resolveLoginStep } from '../lib/login-flow.js';
import {
  fetchTwoFactorStatus,
  isInvalidTotpError,
  regenerateRecoveryCodes,
  TwoFactorApiError,
} from '../lib/two-factor-api.js';

const setup = {
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  otpauthUri: 'otpauth://totp/NutriKids:luis%40hospital.ec?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
};

const session: Extract<AuthResponse, { requiresTwoFactor: false }> = {
  requiresTwoFactor: false,
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 900,
  user: {
    id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
    email: 'luis@hospital.ec',
    firstName: 'Luis',
    lastName: 'Mora',
    roles: ['PROFESSIONAL'],
    specialty: 'pediatrics',
  },
};

const codes = ['ABCD-EFGH', 'JKMN-PQRS', 'TUVW-XYZ2'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveLoginStep (NK-10)', () => {
  it('asks to enroll with the QR when the API sends setup data', () => {
    expect(resolveLoginStep({ requiresTwoFactor: true, setup })).toEqual({
      kind: 'enroll',
      setup,
    });
  });

  it('asks for the code when two-factor is already active', () => {
    expect(resolveLoginStep({ requiresTwoFactor: true })).toEqual({ kind: 'verify' });
  });

  it('holds the session back to show the recovery codes right after activation', () => {
    expect(resolveLoginStep({ ...session, recoveryCodes: codes })).toEqual({
      kind: 'showRecoveryCodes',
      session: { ...session, recoveryCodes: codes },
      codes,
    });
  });

  it('signs in directly otherwise', () => {
    expect(resolveLoginStep(session)).toEqual({ kind: 'signIn', session });
  });

  it('groups the manual key in blocks of four', () => {
    expect(formatManualKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(formatManualKey('ABCDEF')).toBe('ABCD EF');
  });
});

describe('two-factor screens', () => {
  it('renders the QR code, the manual key and the link to the authenticator app', () => {
    const html = renderToString(
      React.createElement(TwoFactorEnrollment, { setup, onOpenError: vi.fn() }),
    );
    expect(html).toContain(setup.qrCodeDataUrl);
    expect(html).toContain('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP');
    expect(html).toContain('Clave para ingresar manualmente');
    expect(html).toContain('Abrir en la aplicación autenticadora');
    expect(html).toContain('aplicación autenticadora');
  });

  it('lists every recovery code with a share button', () => {
    const html = renderToString(React.createElement(RecoveryCodesList, { codes }));
    for (const code of codes) expect(html).toContain(code);
    expect(html).toContain('Compartir o guardar los códigos');
  });

  it('shows the active status and the codes left in the professional profile', () => {
    const html = renderToString(
      React.createElement(TwoFactorCard, {
        initialStatus: { enabled: true, recoveryCodesRemaining: 8 },
      }),
    );
    expect(html).toContain('Verificación en dos pasos');
    expect(html).toContain('Activa');
    expect(html).toContain('Códigos de recuperación disponibles: 8');
    expect(html).toContain('Generar códigos nuevos');
    expect(html).not.toContain('Te quedan pocos códigos');
  });

  it('warns when few recovery codes are left', () => {
    const html = renderToString(
      React.createElement(TwoFactorCard, {
        initialStatus: { enabled: true, recoveryCodesRemaining: 2 },
      }),
    );
    expect(html).toContain('Te quedan pocos códigos de recuperación');
  });
});

describe('two-factor API client', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
  });

  it('reads the two-factor status', async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ enabled: true, recoveryCodesRemaining: 9 }));
    await expect(fetchTwoFactorStatus()).resolves.toEqual({
      enabled: true,
      recoveryCodesRemaining: 9,
    });
    expect(authFetchMock).toHaveBeenCalledWith('/auth/2fa/status');
  });

  it('regenerates the recovery codes with the current TOTP code', async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ recoveryCodes: codes }));
    await expect(regenerateRecoveryCodes('123456')).resolves.toEqual(codes);
    const [path, init] = authFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/auth/2fa/recovery-codes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ totpCode: '123456' });
  });

  it('rejects malformed codes before calling the API', async () => {
    await expect(regenerateRecoveryCodes('12a')).rejects.toThrow();
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it('flags a wrong or reused TOTP code (401)', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({ error: 'Request Error', message: 'Código de verificación inválido' }, 401),
    );
    const err = await regenerateRecoveryCodes('123456').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TwoFactorApiError);
    expect(isInvalidTotpError(err)).toBe(true);
    expect((err as Error).message).toBe('Código de verificación inválido');
  });
});
