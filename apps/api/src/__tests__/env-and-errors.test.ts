import { ErrorResponseSchema } from '@nutrikids/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { errorHandler } from '../middlewares/errorHandler.js';

describe('parseEnv (variables de entorno de autenticación)', () => {
  it('usa valores seguros por defecto en development y test', () => {
    const devEnv = parseEnv({ NODE_ENV: 'test' });
    expect(devEnv.JWT_ACCESS_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(devEnv.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(devEnv.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(devEnv.LOGIN_MAX_ATTEMPTS).toBe(5);
    expect(devEnv.LOGIN_WINDOW_MINUTES).toBe(15);
    expect(devEnv.PROFESSIONAL_INVITE_CODES).toEqual(['NK-PROF-2026']);
  });

  it('separa y recorta múltiples códigos de invitación en PROFESSIONAL_INVITE_CODES', () => {
    const parsed = parseEnv({
      NODE_ENV: 'development',
      PROFESSIONAL_INVITE_CODES: ' CODIGO-1 , CODIGO-2 , ',
    });
    expect(parsed.PROFESSIONAL_INVITE_CODES).toEqual(['CODIGO-1', 'CODIGO-2']);
  });

  it('falla en producción si falta JWT_ACCESS_SECRET o tiene menos de 32 caracteres', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PROFESSIONAL_INVITE_CODES: 'PROD-CODE',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);

    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'secreto-demasiado-corto',
        PROFESSIONAL_INVITE_CODES: 'PROD-CODE',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('falla en producción si falta PROFESSIONAL_INVITE_CODES', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'secreto-de-produccion-con-mas-de-32-caracteres',
      }),
    ).toThrow(/PROFESSIONAL_INVITE_CODES/);
  });
});

describe('HttpError con errorHandler', () => {
  const app = express();
  app.get('/conflict', () => {
    throw HttpError.conflict('El correo ya está registrado');
  });
  app.get('/unauthorized', () => {
    throw HttpError.unauthorized('Credenciales inválidas');
  });
  app.use(errorHandler);

  it('propaga statusCode y mensaje cumpliendo ErrorResponseSchema', async () => {
    const conflictRes = await request(app).get('/conflict');
    expect(conflictRes.status).toBe(409);
    expect(ErrorResponseSchema.safeParse(conflictRes.body).success).toBe(true);
    expect(conflictRes.body).toEqual({
      error: 'Request Error',
      message: 'El correo ya está registrado',
    });

    const unauthRes = await request(app).get('/unauthorized');
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body).toEqual({
      error: 'Request Error',
      message: 'Credenciales inválidas',
    });
  });
});
