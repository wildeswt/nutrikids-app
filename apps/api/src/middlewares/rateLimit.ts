import { createHash } from 'node:crypto';
import type { ErrorResponse } from '@nutrikids/shared';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

export interface LoginRateLimiterOptions {
  maxAttempts?: number;
  windowMinutes?: number;
}

/**
 * Crea un limitador de intentos de inicio de sesión (por defecto 5 intentos fallidos cada 15 min)
 * agrupado por IP + hash del correo electrónico. Los inicios de sesión exitosos no consumen cuota.
 */
export function createLoginRateLimiter(options?: LoginRateLimiterOptions): RequestHandler {
  const maxAttempts = options?.maxAttempts ?? env.LOGIN_MAX_ATTEMPTS;
  const windowMinutes = options?.windowMinutes ?? env.LOGIN_WINDOW_MINUTES;

  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: maxAttempts,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ipKey = ipKeyGenerator(req.ip ?? '127.0.0.1');
      const rawEmail =
        typeof req.body === 'object' &&
        req.body !== null &&
        'email' in req.body &&
        typeof (req.body as { email: unknown }).email === 'string'
          ? (req.body as { email: string }).email.trim().toLowerCase()
          : '';
      const emailHash = createHash('sha256').update(rawEmail, 'utf8').digest('hex').slice(0, 16);
      return `${ipKey}:${emailHash}`;
    },
    handler: (_req, res) => {
      const payload: ErrorResponse = {
        error: 'Too Many Requests',
        message: 'Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.',
      };
      res.status(429).json(payload);
    },
  });
}
