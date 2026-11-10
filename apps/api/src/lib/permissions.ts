import type { Specialty, UserRole } from '@nutrikids/shared';

/** Permisos de negocio que se aplican en el servidor (RT-05). Ver `docs/permisos.md`. */
export const PERMISSIONS = [
  'child:read',
  'checkup:read',
  'checkup:create',
  'curves:read',
  'alert:read',
  'alert:review',
  'feedinglog:read',
  'followup:create',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Identidad autenticada que deja `authenticate` en `req.auth`. */
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
];

/** Matriz de permisos: qué puede ver y registrar el cuidador y cada especialidad profesional. */
export const PERMISSIONS_BY_ACTOR: Readonly<{
  CAREGIVER: readonly Permission[];
  nursing: readonly Permission[];
  nutrition: readonly Permission[];
  pediatrics: readonly Permission[];
}> = {
  CAREGIVER: READ_ALL,
  nursing: [...READ_ALL, 'alert:review'],
  nutrition: [...READ_ALL, 'alert:review', 'followup:create'],
  pediatrics: [...READ_ALL, 'alert:review', 'followup:create'],
};

/** Permisos efectivos: unión de los del cuidador (si tiene ese rol) y los de su especialidad. */
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
