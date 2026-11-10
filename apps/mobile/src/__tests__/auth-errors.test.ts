import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AuthApiError,
  extractZodFieldErrors,
  formatAuthErrorMessage,
  resolveHttpAuthError,
} from '../lib/auth-errors.js';

describe('auth-errors helper', () => {
  it('maps HTTP 401 to clear Spanish credentials error', () => {
    const message = resolveHttpAuthError(401);
    expect(message).toBe('Correo o contraseña incorrectos. Verifica tus credenciales.');
  });

  it('maps HTTP 403 to access denied or invalid invitation error', () => {
    const message = resolveHttpAuthError(403);
    expect(message).toBe('Acceso denegado o código de invitación profesional inválido.');
  });

  it('maps HTTP 409 to duplicate registration conflict error', () => {
    const message = resolveHttpAuthError(409);
    expect(message).toBe('El correo electrónico o número de licencia ya se encuentra registrado.');
  });

  it('maps HTTP 429 to rate limit throttle message', () => {
    const message = resolveHttpAuthError(429);
    expect(message).toContain('Demasiados intentos fallidos');
  });

  it('prioritizes validation issue from payload when present', () => {
    const message = resolveHttpAuthError(400, {
      issues: [{ path: ['email'], message: 'Debe ser un correo electrónico válido' }],
    });
    expect(message).toBe('Debe ser un correo electrónico válido');
  });

  it('formats network and abort errors clearly', () => {
    const networkErr = new TypeError('Failed to fetch (network error)');
    expect(formatAuthErrorMessage(networkErr)).toContain('Verifica tu conexión a internet');

    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    expect(formatAuthErrorMessage(abortErr)).toContain('Verifica tu conexión a internet');
  });

  it('preserves message from AuthApiError instance', () => {
    const apiErr = new AuthApiError('Mensaje personalizado de la API', { status: 400 });
    expect(formatAuthErrorMessage(apiErr)).toBe('Mensaje personalizado de la API');
  });

  it('extracts field errors map from Zod error', () => {
    const schema = z.object({
      email: z.string().email({ message: 'Correo invalido' }),
      password: z.string().min(8, { message: 'Minimo 8 caracteres' }),
    });

    const result = schema.safeParse({ email: 'bad-email', password: '123' });
    expect(result.success).toBe(false);

    if (!result.success) {
      const fieldErrors = extractZodFieldErrors(result.error);
      expect(fieldErrors['email']).toBe('Correo invalido');
      expect(fieldErrors['password']).toBe('Minimo 8 caracteres');
    }
  });
});
