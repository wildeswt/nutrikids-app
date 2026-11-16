import { USER_ROLES } from '@nutrikids/shared';
import { APP_ROUTES, AUTH_STATUS, type AuthStatus } from '../constants/routes.js';

export interface GuardParams {
  status: AuthStatus;
  activeRole: string | null;
  currentGroup?: string;
}

/**
 * Pure route resolution function for role-based navigation guard.
 * Returns the target route to redirect to, or null if the current group is allowed.
 */
export function resolveGuardRedirect(params: GuardParams): string | null {
  if (params.status === AUTH_STATUS.LOADING) {
    return null;
  }

  const inAuthGroup = params.currentGroup === APP_ROUTES.AUTH.GROUP;
  const inCaregiverGroup = params.currentGroup === APP_ROUTES.CAREGIVER.GROUP;
  const inProfessionalGroup = params.currentGroup === APP_ROUTES.PROFESSIONAL.GROUP;

  if (params.status === AUTH_STATUS.UNAUTHENTICATED) {
    return inAuthGroup ? null : APP_ROUTES.AUTH.WELCOME;
  }

  if (params.status === AUTH_STATUS.AUTHENTICATED) {
    if (params.activeRole === USER_ROLES.CAREGIVER) {
      return inCaregiverGroup ? null : APP_ROUTES.CAREGIVER.ROOT;
    }
    if (params.activeRole === USER_ROLES.PROFESSIONAL) {
      return inProfessionalGroup ? null : APP_ROUTES.PROFESSIONAL.ROOT;
    }
  }

  return null;
}
