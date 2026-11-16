import type { Specialty, UserRole } from '@nutrikids/shared';

/** Business permissions enforced on server (RT-05). See `docs/permissions.md`. */
export const PERMISSIONS = [
  'child:read',
  'checkup:read',
  'checkup:create',
  'curves:read',
  'alert:read',
  'alert:review',
  'feedinglog:read',
  'feedinglog:create',
  'followup:create',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Authenticated identity populated by `authenticate` into `req.auth`. */
export interface AuthContext {
  userId: string;
  roles: UserRole[];
  specialty: Specialty | null;
}

const READ_ALL: readonly Permission[] = [
  'child:read',
  'checkup:read',
  'checkup:create',
  'curves:read',
  'alert:read',
  'feedinglog:read',
  'feedinglog:create',
];

/** Permissions matrix: capabilities of caregiver and each professional specialty. */
export const PERMISSIONS_BY_ACTOR: Readonly<{
  CAREGIVER: readonly Permission[];
  nursing: readonly Permission[];
  nutrition: readonly Permission[];
  pediatrics: readonly Permission[];
}> = {
  CAREGIVER: READ_ALL,
  nursing: [...READ_ALL, 'alert:review', 'audit:read'],
  nutrition: [...READ_ALL, 'alert:review', 'followup:create', 'audit:read'],
  pediatrics: [...READ_ALL, 'alert:review', 'followup:create', 'audit:read'],
};

/** Effective permissions: union of caregiver role (if held) and specialty permissions. */
export function permissionsFor(auth: AuthContext): Set<Permission> {
  const result = new Set<Permission>();
  if (auth.roles.includes('CAREGIVER')) {
    PERMISSIONS_BY_ACTOR.CAREGIVER.forEach((p) => result.add(p));
  }
  if (auth.roles.includes('PROFESSIONAL') && auth.specialty) {
    PERMISSIONS_BY_ACTOR[auth.specialty].forEach((p) => result.add(p));
  }
  return result;
}

export function hasPermission(auth: AuthContext, permission: Permission): boolean {
  return permissionsFor(auth).has(permission);
}
