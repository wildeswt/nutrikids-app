import type { RequestHandler } from 'express';
import type { z } from 'zod';

export interface RequestSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/**
 * Middleware que valida `body`, `query` y `params` con los esquemas Zod de `@nutrikids/shared`.
 * Si los datos son válidos, reemplaza la entrada por el valor normalizado; si fallan,
 * delega el `ZodError` al `errorHandler` para responder 400 con `ErrorResponse`.
 */
export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.params) {
      const parsed = schemas.params.safeParse(req.params);
      if (!parsed.success) {
        next(parsed.error);
        return;
      }
      Object.defineProperty(req, 'params', {
        value: parsed.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    if (schemas.query) {
      const parsed = schemas.query.safeParse(req.query);
      if (!parsed.success) {
        next(parsed.error);
        return;
      }
      Object.defineProperty(req, 'query', {
        value: parsed.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    if (schemas.body) {
      const parsed = schemas.body.safeParse(req.body);
      if (!parsed.success) {
        next(parsed.error);
        return;
      }
      req.body = parsed.data;
    }

    next();
  };
}
