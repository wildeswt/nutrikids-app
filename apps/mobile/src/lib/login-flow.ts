import type { AuthResponse, TwoFactorSetup } from '@nutrikids/shared';

/**
 * What the login screen does with each `POST /auth/login` answer (NK-10):
 * - `enroll`: professional without two-factor yet → show the QR and ask for the first code.
 * - `verify`: two-factor already active → ask for the TOTP or a recovery code.
 * - `showRecoveryCodes`: two-factor just activated → show the one-time codes before signing in.
 * - `signIn`: complete session, store it.
 */
export type LoginStep =
  | { kind: 'enroll'; setup: TwoFactorSetup }
  | { kind: 'verify' }
  | {
      kind: 'showRecoveryCodes';
      session: Extract<AuthResponse, { requiresTwoFactor: false }>;
      codes: string[];
    }
  | { kind: 'signIn'; session: Extract<AuthResponse, { requiresTwoFactor: false }> };

export function resolveLoginStep(response: AuthResponse): LoginStep {
  if (response.requiresTwoFactor) {
    return response.setup ? { kind: 'enroll', setup: response.setup } : { kind: 'verify' };
  }
  if (response.recoveryCodes && response.recoveryCodes.length > 0) {
    return { kind: 'showRecoveryCodes', session: response, codes: response.recoveryCodes };
  }
  return { kind: 'signIn', session: response };
}

/** Groups the base32 key in blocks of 4 so it is easier to type into the authenticator. */
export function formatManualKey(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(' ');
}
