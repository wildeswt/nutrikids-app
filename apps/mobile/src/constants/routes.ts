/**
 * Centralized route paths and group identifiers to prevent hardcoded strings.
 */
export const APP_ROUTES = {
  INDEX: '/',
  AUTH: {
    GROUP: '(auth)',
    WELCOME: '/(auth)/welcome' as const,
    SELECT_ROLE: '/(auth)/select-role' as const,
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
    CHECKUP_SAVED: '/(caregiver)/checkup-saved' as const,
    MESSAGES: '/(caregiver)/messages' as const,
    CHAT_DETAIL: '/(caregiver)/chat-detail' as const,
    PROFILE: '/(caregiver)/profile' as const,
    CONSENT: '/(caregiver)/consent' as const,
    ADD_CHILD: '/(caregiver)/add-child' as const,
    NOTIFICATIONS: '/(caregiver)/notifications' as const,
    REMINDERS: '/(caregiver)/reminders' as const,
    ADD_REMINDER: '/(caregiver)/add-reminder' as const,
    LEARN: '/(caregiver)/learn' as const,
    LEARN_ARTICLE: '/(caregiver)/learn-article' as const,
    MY_DATA: '/(caregiver)/my-data' as const,
    EDIT_CHILD: '/(caregiver)/edit-child' as const,
    PRIVACY: '/(caregiver)/privacy' as const,
  },
  PROFESSIONAL: {
    GROUP: '(professional)',
    ROOT: '/(professional)' as const,
    ALERTS: '/(professional)' as const,
    ALERT_DETAIL: '/(professional)/alert-detail' as const,
    FOLLOW_UP: '/(professional)/follow-up' as const,
    CHILDREN: '/(professional)/children' as const,
    MESSAGES: '/(professional)/messages' as const,
    CHAT_DETAIL: '/(professional)/chat-detail' as const,
    PROFILE: '/(professional)/profile' as const,
    NOTIFICATIONS: '/(professional)/notifications' as const,
  },
} as const;

export const AUTH_STATUS = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
} as const;

export type AuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];
