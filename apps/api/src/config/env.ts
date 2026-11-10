import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Loads .env from apps/api if present, or monorepo root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

const DEV_TEST_JWT_SECRET = 'nutrikids-dev-test-jwt-secret-key-min-32-chars';
const DEV_TEST_INVITE_CODES = 'NK-PROF-2026';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://nutrikids:nutrikids@localhost:5433/nutrikids?schema=public'),
    DIRECT_URL: z.string().optional(),
    CORS_ORIGIN: z.string().default('*'),
    JWT_ACCESS_SECRET: z.string().optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    PROFESSIONAL_INVITE_CODES: z.string().optional(),
  })
  .transform((raw, ctx) => {
    const isProd = raw.NODE_ENV === 'production';

    const jwtSecret = raw.JWT_ACCESS_SECRET?.trim() || (isProd ? '' : DEV_TEST_JWT_SECRET);
    if (jwtSecret.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres (obligatorio en producción)',
      });
    }

    const rawCodes = raw.PROFESSIONAL_INVITE_CODES?.trim() || (isProd ? '' : DEV_TEST_INVITE_CODES);
    const inviteCodes = rawCodes
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);

    if (isProd && inviteCodes.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROFESSIONAL_INVITE_CODES'],
        message: 'PROFESSIONAL_INVITE_CODES debe definir al menos un código en producción',
      });
    }

    return {
      NODE_ENV: raw.NODE_ENV,
      PORT: raw.PORT,
      DATABASE_URL: raw.DATABASE_URL,
      DIRECT_URL: raw.DIRECT_URL,
      CORS_ORIGIN: raw.CORS_ORIGIN,
      JWT_ACCESS_SECRET: jwtSecret,
      ACCESS_TOKEN_TTL_SECONDS: raw.ACCESS_TOKEN_TTL_SECONDS,
      REFRESH_TOKEN_TTL_DAYS: raw.REFRESH_TOKEN_TTL_DAYS,
      LOGIN_MAX_ATTEMPTS: raw.LOGIN_MAX_ATTEMPTS,
      LOGIN_WINDOW_MINUTES: raw.LOGIN_WINDOW_MINUTES,
      PROFESSIONAL_INVITE_CODES: inviteCodes,
    };
  });

export type AppEnv = z.infer<typeof EnvSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined>): AppEnv {
  return EnvSchema.parse(rawEnv);
}

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env: AppEnv = parsed.data;
