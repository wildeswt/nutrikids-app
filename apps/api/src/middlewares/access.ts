import { UuidSchema, type Specialty, type UserRole } from '@nutrikids/shared';
import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import { hasPermission, type AuthContext, type Permission } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';

function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw HttpError.unauthorized();
  }
  return req.auth;
}

/** Exige que el usuario tenga al menos uno de los roles indicados. Va después de `authenticate`. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const auth = getAuth(req);
      if (!roles.some((role) => auth.roles.includes(role))) {
        throw HttpError.forbidden('Tu rol no permite esta acción');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Exige rol profesional con una de las especialidades indicadas (enfermería, nutrición, pediatría). */
export function requireSpecialty(...specialties: Specialty[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const auth = getAuth(req);
      if (
        !auth.roles.includes('PROFESSIONAL') ||
        !auth.specialty ||
        !specialties.includes(auth.specialty)
      ) {
        throw HttpError.forbidden('Tu especialidad no permite esta acción');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Exige un permiso de la matriz (`lib/permissions.ts`). */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    try {
      if (!hasPermission(getAuth(req), permission)) {
        throw HttpError.forbidden('No tienes permiso para esta acción');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export type NinoIdSource = string | ((req: Request) => unknown);

/**
 * Exige vínculo con el niño: el cuidador solo accede a niños de `cuida` y el profesional solo a
 * niños de `atiende` con vínculo vigente (hoy entre `startDate` y `endDate`). Sin vínculo, o si el
 * niño no existe, responde 403 sin revelar la diferencia. `source` es el nombre del parámetro de
 * ruta (por defecto `ninoId`) o una función que extrae el id.
 */
export function requireVinculo(source: NinoIdSource = 'ninoId'): RequestHandler {
  return async (req, _res, next) => {
    try {
      const auth = getAuth(req);
      const raw = typeof source === 'function' ? source(req) : req.params[source];
      const parsed = UuidSchema.safeParse(raw);
      if (!parsed.success) {
        throw HttpError.badRequest('Identificador de niño inválido');
      }
      const childId = parsed.data;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const vinculo = await withUser(auth.userId, async (tx) => {
        if (auth.roles.includes('CAREGIVER')) {
          const link = await tx.caregiverChild.findUnique({
            where: { caregiverId_childId: { caregiverId: auth.userId, childId } },
          });
          if (link) return 'CAREGIVER' as const;
        }
        if (auth.roles.includes('PROFESSIONAL')) {
          const link = await tx.professionalChild.findFirst({
            where: {
              childId,
              professionalId: auth.userId,
              startDate: { lte: today },
              OR: [{ endDate: null }, { endDate: { gte: today } }],
            },
          });
          if (link) return 'PROFESSIONAL' as const;
        }
        return null;
      });

      if (!vinculo) {
        throw HttpError.forbidden('No tienes acceso a este niño');
      }
      req.vinculo = vinculo;
      next();
    } catch (err) {
      next(err);
    }
  };
}
