import { USER_ROLES } from '@nutrikids/shared';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES, AUTH_STATUS } from '../constants/routes.js';
import { resolveGuardRedirect } from '../lib/navigation-guard.js';

describe('resolveGuardRedirect (NavigationGuard routing logic)', () => {
  it('returns null when auth status is loading (waiting for session initialization)', () => {
    const result = resolveGuardRedirect({
      status: AUTH_STATUS.LOADING,
      activeRole: null,
      currentGroup: undefined,
    });
    expect(result).toBeNull();
  });

  describe('unauthenticated state', () => {
    it('redirects to login when user is on the root path', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.UNAUTHENTICATED,
        activeRole: null,
        currentGroup: undefined,
      });
      expect(result).toBe(APP_ROUTES.AUTH.LOGIN);
    });

    it('redirects to login when unauthenticated user tries to access caregiver group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.UNAUTHENTICATED,
        activeRole: null,
        currentGroup: APP_ROUTES.CAREGIVER.GROUP,
      });
      expect(result).toBe(APP_ROUTES.AUTH.LOGIN);
    });

    it('redirects to login when unauthenticated user tries to access professional group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.UNAUTHENTICATED,
        activeRole: null,
        currentGroup: APP_ROUTES.PROFESSIONAL.GROUP,
      });
      expect(result).toBe(APP_ROUTES.AUTH.LOGIN);
    });

    it('allows access (returns null) when unauthenticated user is inside auth group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.UNAUTHENTICATED,
        activeRole: null,
        currentGroup: APP_ROUTES.AUTH.GROUP,
      });
      expect(result).toBeNull();
    });
  });

  describe('caregiver role authenticated state', () => {
    it('allows access (returns null) when caregiver is inside caregiver group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.CAREGIVER,
        currentGroup: APP_ROUTES.CAREGIVER.GROUP,
      });
      expect(result).toBeNull();
    });

    it('redirects to caregiver root when caregiver is inside auth group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.CAREGIVER,
        currentGroup: APP_ROUTES.AUTH.GROUP,
      });
      expect(result).toBe(APP_ROUTES.CAREGIVER.ROOT);
    });

    it('redirects to caregiver root when caregiver tries to access professional group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.CAREGIVER,
        currentGroup: APP_ROUTES.PROFESSIONAL.GROUP,
      });
      expect(result).toBe(APP_ROUTES.CAREGIVER.ROOT);
    });

    it('redirects to caregiver root when caregiver is at root route', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.CAREGIVER,
        currentGroup: undefined,
      });
      expect(result).toBe(APP_ROUTES.CAREGIVER.ROOT);
    });
  });

  describe('professional role authenticated state', () => {
    it('allows access (returns null) when professional is inside professional group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.PROFESSIONAL,
        currentGroup: APP_ROUTES.PROFESSIONAL.GROUP,
      });
      expect(result).toBeNull();
    });

    it('redirects to professional root when professional is inside auth group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.PROFESSIONAL,
        currentGroup: APP_ROUTES.AUTH.GROUP,
      });
      expect(result).toBe(APP_ROUTES.PROFESSIONAL.ROOT);
    });

    it('redirects to professional root when professional tries to access caregiver group', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.PROFESSIONAL,
        currentGroup: APP_ROUTES.CAREGIVER.GROUP,
      });
      expect(result).toBe(APP_ROUTES.PROFESSIONAL.ROOT);
    });

    it('redirects to professional root when professional is at root route', () => {
      const result = resolveGuardRedirect({
        status: AUTH_STATUS.AUTHENTICATED,
        activeRole: USER_ROLES.PROFESSIONAL,
        currentGroup: undefined,
      });
      expect(result).toBe(APP_ROUTES.PROFESSIONAL.ROOT);
    });
  });
});
