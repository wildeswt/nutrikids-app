/**
 * Centralized route paths and group identifiers to prevent hardcoded strings.
 */
export const APP_ROUTES = {
  INDEX: '/',
  AUTH: {
    GROUP: '(auth)',
    LOGIN: '/(auth)/login' as const,
    REGISTER: '/(auth)/register' as const,
    FORGOT_PASSWORD: '/(auth)/forgot-password' as const,
    RESET_PASSWORD: '/(auth)/reset-password' as const,
  },
  CAREGIVER: {
    GROUP: '(caregiver)',
    ROOT: '/(caregiver)' as const,
    HOME: '/(caregiver)' as const,
    EVOLUTION: '/(caregiver)/evolution' as const,
    ADD_CHECKUP: '/(caregiver)/add-checkup' as const,
    MESSAGES: '/(caregiver)/messages' as const,
    PROFILE: '/(caregiver)/profile' as const,
    CONSENT: '/(caregiver)/consent' as const,
  },
  PROFESSIONAL: {
    GROUP: '(professional)',
    ROOT: '/(professional)' as const,
    ALERTS: '/(professional)' as const,
    CHILDREN: '/(professional)/children' as const,
    MESSAGES: '/(professional)/messages' as const,
    PROFILE: '/(professional)/profile' as const,
  },
} as const;

export const AUTH_STATUS = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
} as const;

export type AuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];
