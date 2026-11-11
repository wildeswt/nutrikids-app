import type { RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { verifyAccessToken } from '../services/token.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      vinculo?: 'CAREGIVER' | 'PROFESSIONAL';
    }
  }
}

/** Exige `Authorization: Bearer <jwt>` válido y deja la identidad en `req.auth`. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    const match = header ? /^Bearer (.+)$/i.exec(header) : null;
    if (!match?.[1]) {
      throw HttpError.unauthorized('Falta el token de acceso');
    }
    const claims = await verifyAccessToken(match[1]);
    req.auth = { userId: claims.sub, roles: claims.roles, specialty: claims.specialty };
    next();
  } catch (err) {
    next(err);
  }
};
