import { USER_ROLES } from '@nutrikids/shared';
import { APP_ROUTES, AUTH_STATUS, type AuthStatus } from '../constants/routes.js';

export interface GuardParams {
  status: AuthStatus;
  activeRole: string | null;
  currentGroup?: string;
  /** Screen inside the group (`messages`, `add-checkup`...), when there is one. */
  leaf?: string;
  /** Query string of the current URL, with its leading `?` (or empty). */
  query?: string;
}

/**
 * Screens that exist in both role groups. On web the URL has no group, so a reload of
 * `/messages` always resolves to the first group (caregiver): a professional must land on the
 * same screen of their own group, not on the home.
 */
const SHARED_SCREENS: ReadonlySet<string> = new Set([
  'add-checkup',
  'chat-detail',
  'checkup-history',
  'checkup-saved',
  'evolution',
  'messages',
  'notifications',
  'pending-sync',
  'profile',
]);

function roleRoot(root: string, params: GuardParams): string {
  return params.leaf && SHARED_SCREENS.has(params.leaf)
    ? `${root}/${params.leaf}${params.query ?? ''}`
    : root;
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
      return inCaregiverGroup ? null : roleRoot(APP_ROUTES.CAREGIVER.ROOT, params);
    }
    if (params.activeRole === USER_ROLES.PROFESSIONAL) {
      return inProfessionalGroup ? null : roleRoot(APP_ROUTES.PROFESSIONAL.ROOT, params);
    }
  }

  return null;
}
