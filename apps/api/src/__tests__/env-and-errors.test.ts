import { randomBytes } from 'node:crypto';
import { ErrorResponseSchema } from '@nutrikids/shared';
import { DEFAULT_CUTOFFS } from '@nutrikids/who-growth';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { errorHandler } from '../middlewares/errorHandler.js';

const VALID_KEY_32B = randomBytes(32).toString('base64');
const VALID_KEY_2_32B = randomBytes(32).toString('base64');

function validTestEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'test',
    DATA_ENCRYPTION_KEY: VALID_KEY_32B,
    PSEUDONYMIZATION_KEY: VALID_KEY_2_32B,
    ...overrides,
  };
}

describe('parseEnv (variables de entorno de autenticación)', () => {
  it('usa valores seguros por defecto en development y test', () => {
    const devEnv = parseEnv(validTestEnv());
    expect(devEnv.JWT_ACCESS_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(devEnv.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(devEnv.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(devEnv.LOGIN_MAX_ATTEMPTS).toBe(5);
    expect(devEnv.LOGIN_WINDOW_MINUTES).toBe(15);
    expect(devEnv.PROFESSIONAL_INVITE_CODES).toEqual(['NK-PROF-2026']);
    expect(devEnv.ALERT_REVIEW_DEADLINE_HOURS).toBe(72);
    expect(devEnv.ALERT_REVIEW_DEADLINE_SEVERE_HOURS).toBe(24);
    expect(devEnv.OVERDUE_ALERTS_INTERVAL_MINUTES).toBe(60);
    expect(devEnv.OVERDUE_ALERT_RENOTIFY_HOURS).toBe(24);
    expect(devEnv.DATA_ENCRYPTION_KEY).toBe(VALID_KEY_32B);
    expect(devEnv.DATA_ENCRYPTION_KEY_ID).toBe('k1');
    expect(devEnv.PSEUDONYMIZATION_KEY).toBe(VALID_KEY_2_32B);
  });

  it('separa y recorta múltiples códigos de invitación en PROFESSIONAL_INVITE_CODES', () => {
    const parsed = parseEnv(
      validTestEnv({
        NODE_ENV: 'development',
        PROFESSIONAL_INVITE_CODES: ' CODIGO-1 , CODIGO-2 , ',
      }),
    );
    expect(parsed.PROFESSIONAL_INVITE_CODES).toEqual(['CODIGO-1', 'CODIGO-2']);
  });

  it('falla en producción si falta JWT_ACCESS_SECRET o tiene menos de 32 caracteres', () => {
    expect(() =>
      parseEnv(
        validTestEnv({
          NODE_ENV: 'production',
          PROFESSIONAL_INVITE_CODES: 'PROD-CODE',
        }),
      ),
    ).toThrow(/JWT_ACCESS_SECRET/);

    expect(() =>
      parseEnv(
        validTestEnv({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'secreto-demasiado-corto',
          PROFESSIONAL_INVITE_CODES: 'PROD-CODE',
        }),
      ),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('falla en producción si falta PROFESSIONAL_INVITE_CODES', () => {
    expect(() =>
      parseEnv(
        validTestEnv({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'secreto-de-produccion-con-mas-de-32-caracteres',
        }),
      ),
    ).toThrow(/PROFESSIONAL_INVITE_CODES/);
  });

  it('falla si falta DATA_ENCRYPTION_KEY o PSEUDONYMIZATION_KEY en cualquier entorno', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', PSEUDONYMIZATION_KEY: VALID_KEY_32B })).toThrow(
      /DATA_ENCRYPTION_KEY/,
    );
    expect(() => parseEnv({ NODE_ENV: 'test', DATA_ENCRYPTION_KEY: VALID_KEY_32B })).toThrow(
      /PSEUDONYMIZATION_KEY/,
    );
  });

  it('falla si DATA_ENCRYPTION_KEY no es una clave base64 válida de 32 bytes', () => {
    // 16 bytes base64
    expect(() =>
      parseEnv(
        validTestEnv({
          DATA_ENCRYPTION_KEY: Buffer.from('1234567890123456').toString('base64'),
        }),
      ),
    ).toThrow();
  });
});

describe('parseEnv (puntos de corte de clasificación, RF-08)', () => {
  it('usa los puntos de corte OMS por defecto si no hay variables', () => {
    expect(parseEnv(validTestEnv()).CLASSIFICATION_CUTOFFS).toEqual(DEFAULT_CUTOFFS);
  });

  it('lee los puntos de corte y el criterio de sobrepeso desde la configuración', () => {
    const parsed = parseEnv(
      validTestEnv({
        CUTOFF_WASTING_WFLH: '-2.5',
        CUTOFF_OVERWEIGHT_RISK_BFA: '1.5',
        CUTOFF_STUNTING_LHFA: '',
        OVERWEIGHT_CRITERION: 'both',
      }),
    );
    expect(parsed.CLASSIFICATION_CUTOFFS).toEqual({
      ...DEFAULT_CUTOFFS,
      wastingWFLH: -2.5,
      overweightRiskBFA: 1.5,
      overweightCriterion: 'both',
    });
  });

  it('rechaza valores no numéricos, criterios desconocidos y cortes incoherentes', () => {
    expect(() => parseEnv(validTestEnv({ CUTOFF_WASTING_WFLH: 'abc' }))).toThrow();
    expect(() => parseEnv(validTestEnv({ OVERWEIGHT_CRITERION: 'IMC' }))).toThrow();
    expect(() =>
      parseEnv(validTestEnv({ CUTOFF_SEVERE_WASTING_WFLH: '-1', CUTOFF_WASTING_WFLH: '-2' })),
    ).toThrow(/severeWastingWFLH/);
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
