import { USER_ROLES, type AuthResponse, type AuthUser, type UserRole } from '@nutrikids/shared';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AUTH_STATUS, type AuthStatus } from '../constants/routes.js';
import i18n from '../i18n/index.js';
import {
  logoutSessionRequest,
  onSessionExpired,
  onSessionRefreshError,
  onSessionUpdated,
} from '../lib/api.js';
import { clearDrafts } from '../lib/follow-up-storage.js';
import {
  initPushNotifications,
  registerPushNotifications,
  unregisterPushNotifications,
} from '../lib/push-notifications.js';
import {
  clearStoredSession,
  getStoredSession,
  saveStoredSession,
  updateStoredActiveRole,
  type StoredSession,
} from '../lib/session-storage.js';

export type AuthenticatedAuthResponse = Extract<AuthResponse, { requiresTwoFactor: false }>;

export interface AuthContextValue {
  status: AuthStatus;
  session: StoredSession | null;
  user: AuthUser | null;
  activeRole: UserRole | null;
  refreshError: string | null;
  clearRefreshError: () => void;
  signIn: (response: AuthenticatedAuthResponse, preferredRole?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>(AUTH_STATUS.LOADING);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Load session from secure storage on startup.
  useEffect(() => {
    let isMounted = true;

    initPushNotifications();

    async function initializeSession() {
      try {
        const stored = await getStoredSession();
        if (!isMounted) return;

        if (stored) {
          setSession(stored);
          setStatus(AUTH_STATUS.AUTHENTICATED);
          if (stored.user.roles.includes(USER_ROLES.PROFESSIONAL)) {
            void registerPushNotifications().catch((err) => {
              console.warn('Could not register push notifications on session restore:', err);
            });
          }
        } else {
          setSession(null);
          setStatus(AUTH_STATUS.UNAUTHENTICATED);
        }
      } catch {
        if (!isMounted) return;
        setSession(null);
        setStatus(AUTH_STATUS.UNAUTHENTICATED);
      }
    }

    void initializeSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen to api client session expiration, renewal, and refresh error events.
  useEffect(() => {
    const unsubExpired = onSessionExpired(() => {
      setSession(null);
      setStatus(AUTH_STATUS.UNAUTHENTICATED);
    });

    const unsubUpdated = onSessionUpdated((updatedSession) => {
      setSession(updatedSession);
      setRefreshError(null);
      setStatus(AUTH_STATUS.AUTHENTICATED);
    });

    const unsubRefreshError = onSessionRefreshError((err) => {
      const message = err instanceof Error ? err.message : i18n.t('errors:sessionRefreshNetwork');
      setRefreshError(message);
    });

    return () => {
      unsubExpired();
      unsubUpdated();
      unsubRefreshError();
    };
  }, []);

  const clearRefreshError = useCallback(() => {
    setRefreshError(null);
  }, []);

  const signIn = useCallback(
    async (authResponse: AuthenticatedAuthResponse, preferredRole?: UserRole): Promise<void> => {
      const userRoles = authResponse.user.roles;
      let targetRole: UserRole;

      if (preferredRole && userRoles.includes(preferredRole)) {
        targetRole = preferredRole;
      } else if (userRoles.includes(USER_ROLES.CAREGIVER)) {
        targetRole = USER_ROLES.CAREGIVER;
      } else {
        targetRole = USER_ROLES.PROFESSIONAL;
      }

      const newSession: StoredSession = {
        accessToken: authResponse.accessToken,
        refreshToken: authResponse.refreshToken,
        expiresAt: Date.now() + authResponse.expiresIn * 1000,
        user: authResponse.user,
        activeRole: targetRole,
      };

      await saveStoredSession(newSession);
      setSession(newSession);
      setRefreshError(null);
      setStatus(AUTH_STATUS.AUTHENTICATED);

      if (authResponse.user.roles.includes(USER_ROLES.PROFESSIONAL)) {
        void registerPushNotifications().catch((err) => {
          console.warn('Could not register push notifications on signIn:', err);
        });
      }
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    // 1. Unregister push device token before clearing the session, while authFetch is still authenticated.
    try {
      await unregisterPushNotifications();
    } catch (pushErr) {
      console.warn('Could not unregister push device during signOut:', pushErr);
    }

    // 2. Revoke refresh token and clear storage.
    try {
      // Read latest persisted session directly to guarantee using the most recent rotated token.
      const latestSession = await getStoredSession();
      const tokenToRevoke = latestSession?.refreshToken ?? session?.refreshToken;
      if (tokenToRevoke) {
        await logoutSessionRequest(tokenToRevoke);
      }
    } finally {
      // Clinical drafts do not stay on the phone after sign-out (follow-ups still waiting to be
      // sent are kept, scoped to their user, so they are not lost).
      await clearDrafts().catch(() => {});
      await clearStoredSession();
      setSession(null);
      setRefreshError(null);
      setStatus(AUTH_STATUS.UNAUTHENTICATED);
    }
  }, [session?.refreshToken]);

  const switchRole = useCallback(
    async (newRole: UserRole): Promise<void> => {
      if (!session) {
        throw new Error('Cannot switch role without an active session');
      }
      const updated = await updateStoredActiveRole(newRole);
      if (updated) {
        setSession(updated);
      }
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      activeRole: session?.activeRole ?? null,
      refreshError,
      clearRefreshError,
      signIn,
      signOut,
      switchRole,
    }),
    [status, session, refreshError, clearRefreshError, signIn, signOut, switchRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
