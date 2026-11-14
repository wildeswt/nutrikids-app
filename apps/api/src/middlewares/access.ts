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

/** Requires user to have at least one of the specified roles. Placed after `authenticate`. */
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

/** Requires professional role with one of the specified specialties (nursing, nutrition, pediatrics). */
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

/** Requires a permission defined in the permissions matrix (`lib/permissions.ts`). */
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

export type ChildIdSource = string | ((req: Request) => unknown);

/** Profile under which the user is linked to a child. */
export type ChildLink = 'CAREGIVER' | 'PROFESSIONAL';

/**
 * Resolves the user's link to a child: caregivers via `caregiver_children`, professionals via
 * an active `professional_children` assignment (today between startDate and endDate).
 * Returns `null` if there is no link or the child does not exist (indistinguishable).
 */
export async function resolveChildLink(
  auth: AuthContext,
  childId: string,
): Promise<ChildLink | null> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return withUser(auth.userId, async (tx) => {
    if (auth.roles.includes('CAREGIVER')) {
      const caregiverLink = await tx.caregiverChild.findUnique({
        where: { caregiverId_childId: { caregiverId: auth.userId, childId } },
      });
      if (caregiverLink) return 'CAREGIVER' as const;
    }
    if (auth.roles.includes('PROFESSIONAL')) {
      const professionalLink = await tx.professionalChild.findFirst({
        where: {
          childId,
          professionalId: auth.userId,
          startDate: { lte: today },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
      });
      if (professionalLink) return 'PROFESSIONAL' as const;
    }
    return null;
  });
}

/**
 * Requires link to the child: caregivers only access children they care for,
 * and professionals only access children they attend with an active link
 * (today between startDate and endDate). Without link or if the child does not
 * exist, responds with 403 without revealing the difference.
 */
export function requireLink(source: ChildIdSource = 'childId'): RequestHandler {
  return async (req, _res, next) => {
    try {
      const auth = getAuth(req);
      const raw = typeof source === 'function' ? source(req) : req.params[source];
      const parsed = UuidSchema.safeParse(raw);
      if (!parsed.success) {
        throw HttpError.badRequest('Identificador de niño inválido');
      }
      const link = await resolveChildLink(auth, parsed.data);

      if (!link) {
        throw HttpError.forbidden('No tienes acceso a este niño');
      }
      req.link = link;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Requires active informed consent (revokedAt is null) for the child (RF-02).
 * Without active consent, clinical data (checkups, etc.) cannot be registered.
 * `source` is route parameter name (default `childId`) or custom extractor function.
 */
export function requireActiveConsent(source: ChildIdSource = 'childId'): RequestHandler {
  return async (req, _res, next) => {
    try {
      const auth = getAuth(req);
      const raw = typeof source === 'function' ? source(req) : req.params[source];
      const parsed = UuidSchema.safeParse(raw);
      if (!parsed.success) {
        throw HttpError.badRequest('Identificador de niño inválido');
      }
      const childId = parsed.data;

      const activeConsent = await withUser(auth.userId, async (tx) => {
        return tx.consent.findFirst({
          where: {
            childId,
            revokedAt: null,
          },
          select: { id: true },
        });
      });

      if (!activeConsent) {
        throw HttpError.forbidden(
          'El niño no cuenta con un consentimiento informado vigente para registrar datos',
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
