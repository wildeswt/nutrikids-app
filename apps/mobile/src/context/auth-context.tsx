import { USER_ROLES, type AuthResponse, type AuthUser, type UserRole } from '@nutrikids/shared';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AUTH_STATUS, type AuthStatus } from '../constants/routes.js';
import { logoutSessionRequest, onSessionExpired, onSessionUpdated } from '../lib/api.js';
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

  // Load session from secure storage on startup.
  useEffect(() => {
    let isMounted = true;

    async function initializeSession() {
      try {
        const stored = await getStoredSession();
        if (!isMounted) return;

        if (stored) {
          setSession(stored);
          setStatus(AUTH_STATUS.AUTHENTICATED);
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

  // Listen to api client session expiration and renewal events.
  useEffect(() => {
    const unsubExpired = onSessionExpired(() => {
      setSession(null);
      setStatus(AUTH_STATUS.UNAUTHENTICATED);
    });

    const unsubUpdated = onSessionUpdated((updatedSession) => {
      setSession(updatedSession);
      setStatus(AUTH_STATUS.AUTHENTICATED);
    });

    return () => {
      unsubExpired();
      unsubUpdated();
    };
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
      setStatus(AUTH_STATUS.AUTHENTICATED);
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    const currentRefreshToken = session?.refreshToken;
    try {
      if (currentRefreshToken) {
        await logoutSessionRequest(currentRefreshToken);
      }
    } finally {
      await clearStoredSession();
      setSession(null);
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
      signIn,
      signOut,
      switchRole,
    }),
    [status, session, signIn, signOut, switchRole],
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
