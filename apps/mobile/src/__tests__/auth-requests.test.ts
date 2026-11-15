import { USER_ROLES } from '@nutrikids/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

import {
  AuthApiError,
  forgotPasswordRequest,
  loginRequest,
  registerRequest,
  resetPasswordRequest,
} from '../lib/api.js';

describe('auth request helpers in lib/api.ts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('loginRequest', () => {
    it('successfully logs in and returns tokens with user payload', async () => {
      const mockResponse = {
        requiresTwoFactor: false,
        accessToken: 'access-jwt',
        refreshToken: 'refresh-jwt',
        expiresIn: 3600,
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'user@example.com',
          firstName: 'Ana',
          lastName: 'Gomez',
          roles: [USER_ROLES.CAREGIVER],
          specialty: null,
        },
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await loginRequest({
        email: 'user@example.com',
        password: 'Password123!',
      });

      expect(result.requiresTwoFactor).toBe(false);
      if (!result.requiresTwoFactor) {
        expect(result.accessToken).toBe('access-jwt');
        expect(result.user.email).toBe('user@example.com');
      }
    });

    it('returns requiresTwoFactor: true without tokens for two-factor challenge', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ requiresTwoFactor: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await loginRequest({
        email: 'dr.pediatra@example.com',
        password: 'Password123!',
      });

      expect(result.requiresTwoFactor).toBe(true);
    });

    it('keeps the QR setup data when the professional must activate two-factor (NK-10)', async () => {
      const setup = {
        secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        otpauthUri: 'otpauth://totp/NutriKids:dr.pediatra%40example.com?secret=JBSW',
        qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ requiresTwoFactor: true, setup }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const result = await loginRequest({
        email: 'dr.pediatra@example.com',
        password: 'Password123!',
      });

      expect(result).toEqual({ requiresTwoFactor: true, setup });
    });

    it('sends the TOTP code on the second step and receives the one-time recovery codes', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            requiresTwoFactor: false,
            accessToken: 'access',
            refreshToken: 'refresh',
            expiresIn: 900,
            user: {
              id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
              email: 'dr.pediatra@example.com',
              firstName: 'Luis',
              lastName: 'Mora',
              roles: [USER_ROLES.PROFESSIONAL],
              specialty: 'pediatrics',
            },
            recoveryCodes: ['ABCD-EFGH', 'JKMN-PQRS'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await loginRequest({
        email: 'dr.pediatra@example.com',
        password: 'Password123!',
        totpCode: '123456',
      });

      expect(JSON.parse(mockFetch.mock.calls[0]![1].body as string)).toMatchObject({
        totpCode: '123456',
      });
      expect(result.requiresTwoFactor).toBe(false);
      if (!result.requiresTwoFactor) {
        expect(result.recoveryCodes).toEqual(['ABCD-EFGH', 'JKMN-PQRS']);
      }
    });

    it('throws AuthApiError with clear message on 401', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Credenciales inválidas' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        loginRequest({
          email: 'wrong@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(AuthApiError);

      await expect(
        loginRequest({
          email: 'wrong@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow('Correo o contraseña incorrectos. Verifica tus credenciales.');
    });

    it('throws AuthApiError in Spanish when server response does not match expected schema', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpectedField: 'invalid' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        loginRequest({
          email: 'user@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow('La respuesta del servidor no tiene el formato esperado.');
    });
  });

  describe('registerRequest', () => {
    it('successfully registers caregiver account', async () => {
      const mockResponse = {
        requiresTwoFactor: false,
        accessToken: 'access-jwt',
        refreshToken: 'refresh-jwt',
        expiresIn: 3600,
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'newuser@example.com',
          firstName: 'Carlos',
          lastName: 'Mendez',
          roles: [USER_ROLES.CAREGIVER],
          specialty: null,
        },
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await registerRequest({
        email: 'newuser@example.com',
        password: 'Password123!',
        firstName: 'Carlos',
        lastName: 'Mendez',
        roles: [USER_ROLES.CAREGIVER],
      });

      expect(result.requiresTwoFactor).toBe(false);
      if (!result.requiresTwoFactor) {
        expect(result.user.email).toBe('newuser@example.com');
      }
    });

    it('throws AuthApiError with conflict message on 409', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'El correo electrónico ya está registrado' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        registerRequest({
          email: 'existing@example.com',
          password: 'Password123!',
          firstName: 'Ana',
          lastName: 'Perez',
          roles: [USER_ROLES.CAREGIVER],
        }),
      ).rejects.toThrow('El correo electrónico o número de licencia ya se encuentra registrado.');
    });
  });

  describe('forgotPasswordRequest and resetPasswordRequest', () => {
    it('dispatches forgot-password request successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message:
              'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await forgotPasswordRequest({ email: 'user@example.com' });
      expect(result.message).toContain('instrucciones');
    });

    it('dispatches reset-password request successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        resetPasswordRequest({
          token: 'valid-reset-token-12345',
          newPassword: 'NewPassword123!',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
