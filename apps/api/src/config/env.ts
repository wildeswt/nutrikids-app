import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CUTOFFS, type Cutoffs } from '@nutrikids/who-growth';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Loads .env from apps/api if present, or monorepo root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

const DEV_TEST_JWT_SECRET = 'nutrikids-dev-test-jwt-secret-key-min-32-chars';
const DEV_TEST_INVITE_CODES = 'NK-PROF-2026';

/**
 * Classification cutoffs (z-scores) read from configuration (RF-08).
 * Each env var is optional; missing ones fall back to WHO defaults (`DEFAULT_CUTOFFS`).
 */
const CUTOFF_ENV_KEYS = {
  CUTOFF_SEVERE_WASTING_WFLH: 'severeWastingWFLH',
  CUTOFF_WASTING_WFLH: 'wastingWFLH',
  CUTOFF_SEVERE_UNDERWEIGHT_WFA: 'severeUnderweightWFA',
  CUTOFF_UNDERWEIGHT_WFA: 'underweightWFA',
  CUTOFF_SEVERE_STUNTING_LHFA: 'severeStuntingLHFA',
  CUTOFF_STUNTING_LHFA: 'stuntingLHFA',
  CUTOFF_OVERWEIGHT_WFLH: 'overweightWFLH',
  CUTOFF_OVERWEIGHT_BFA: 'overweightBFA',
  CUTOFF_OVERWEIGHT_RISK_BFA: 'overweightRiskBFA',
  CUTOFF_OBESITY_BFA: 'obesityBFA',
} as const satisfies Record<string, Exclude<keyof Cutoffs, 'overweightCriterion'>>;

type CutoffEnvKey = keyof typeof CUTOFF_ENV_KEYS;

const optionalNumber = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.coerce.number().finite().optional(),
);

const cutoffEnvShape = Object.fromEntries(
  Object.keys(CUTOFF_ENV_KEYS).map((key) => [key, optionalNumber]),
) as Record<CutoffEnvKey, typeof optionalNumber>;

/** Pairs [lower, upper] that must satisfy lower < upper for the classification to be coherent. */
const CUTOFF_ORDER: readonly [keyof Cutoffs, keyof Cutoffs][] = [
  ['severeWastingWFLH', 'wastingWFLH'],
  ['severeUnderweightWFA', 'underweightWFA'],
  ['severeStuntingLHFA', 'stuntingLHFA'],
  ['wastingWFLH', 'overweightWFLH'],
  ['overweightRiskBFA', 'overweightBFA'],
  ['overweightBFA', 'obesityBFA'],
];

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
    /** Plazo (horas) para revisar una alerta sin revisar antes de marcarla vencida (NK-30). */
    ALERT_REVIEW_DEADLINE_HOURS: z.coerce.number().int().positive().default(72),
    /** Plazo (horas) para alertas de riesgo grave (z < −3). */
    ALERT_REVIEW_DEADLINE_SEVERE_HOURS: z.coerce.number().int().positive().default(24),
    /** Intervalo (minutos) entre ejecuciones del job de alertas vencidas (NK-36). */
    OVERDUE_ALERTS_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
    /** Intervalo mínimo (horas) antes de volver a notificar una alerta vencida al mismo profesional (NK-36). */
    OVERDUE_ALERT_RENOTIFY_HOURS: z.coerce.number().int().positive().default(24),
    ...cutoffEnvShape,
    OVERWEIGHT_CRITERION: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.enum(['WFLH', 'BFA', 'both']).optional(),
    ),
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

    const cutoffs: Cutoffs = { ...DEFAULT_CUTOFFS };
    for (const [envKey, cutoffKey] of Object.entries(CUTOFF_ENV_KEYS) as [
      CutoffEnvKey,
      (typeof CUTOFF_ENV_KEYS)[CutoffEnvKey],
    ][]) {
      const value = raw[envKey];
      if (value !== undefined) cutoffs[cutoffKey] = value;
    }
    if (raw.OVERWEIGHT_CRITERION) cutoffs.overweightCriterion = raw.OVERWEIGHT_CRITERION;

    for (const [lower, upper] of CUTOFF_ORDER) {
      if (!((cutoffs[lower] as number) < (cutoffs[upper] as number))) {
        ctx.addIssue({
          code: 'custom',
          path: ['CLASSIFICATION_CUTOFFS'],
          message: `Puntos de corte incoherentes: ${lower} (${cutoffs[lower]}) debe ser menor que ${upper} (${cutoffs[upper]})`,
        });
      }
    }

    if (raw.ALERT_REVIEW_DEADLINE_SEVERE_HOURS > raw.ALERT_REVIEW_DEADLINE_HOURS) {
      ctx.addIssue({
        code: 'custom',
        path: ['ALERT_REVIEW_DEADLINE_SEVERE_HOURS'],
        message:
          'ALERT_REVIEW_DEADLINE_SEVERE_HOURS no puede ser mayor que ALERT_REVIEW_DEADLINE_HOURS',
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
      CLASSIFICATION_CUTOFFS: Object.freeze(cutoffs) as Readonly<Cutoffs>,
      ALERT_REVIEW_DEADLINE_HOURS: raw.ALERT_REVIEW_DEADLINE_HOURS,
      ALERT_REVIEW_DEADLINE_SEVERE_HOURS: raw.ALERT_REVIEW_DEADLINE_SEVERE_HOURS,
      OVERDUE_ALERTS_INTERVAL_MINUTES: raw.OVERDUE_ALERTS_INTERVAL_MINUTES,
      OVERDUE_ALERT_RENOTIFY_HOURS: raw.OVERDUE_ALERT_RENOTIFY_HOURS,
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
