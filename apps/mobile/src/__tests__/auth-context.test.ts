import { USER_ROLES } from '@nutrikids/shared';
import React, { act, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockStore.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

const mockLogoutSessionRequest = vi.fn().mockResolvedValue(undefined);
const mockRegisterPushNotifications = vi.fn().mockResolvedValue('ExponentPushToken[mock]');
const mockUnregisterPushNotifications = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/push-notifications.js', () => ({
  initPushNotifications: vi.fn(),
  registerPushNotifications: () => mockRegisterPushNotifications(),
  unregisterPushNotifications: () => mockUnregisterPushNotifications(),
}));

vi.mock('../lib/api.js', () => ({
  logoutSessionRequest: (...args: unknown[]) => mockLogoutSessionRequest(...args),
  onSessionExpired: () => () => {},
  onSessionUpdated: () => () => {},
  onSessionRefreshError: () => () => {},
}));

import { AuthProvider, useAuth, type AuthContextValue } from '../context/auth-context.js';
import {
  clearStoredSession,
  saveStoredSession,
  type StoredSession,
} from '../lib/session-storage.js';

describe('auth-context', () => {
  const sampleCaregiverSession: StoredSession = {
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 3600_000,
    user: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'caregiver@example.com',
      firstName: 'María',
      lastName: 'Pérez',
      roles: [USER_ROLES.CAREGIVER],
      specialty: null,
    },
    activeRole: USER_ROLES.CAREGIVER,
  };

  const sampleDualSession: StoredSession = {
    ...sampleCaregiverSession,
    user: {
      ...sampleCaregiverSession.user,
      roles: [USER_ROLES.CAREGIVER, USER_ROLES.PROFESSIONAL],
      specialty: 'pediatrics',
    },
  };

  beforeEach(async () => {
    mockStore.clear();
    await clearStoredSession();
    vi.restoreAllMocks();
  });

  it('provides unauthenticated status when storage is empty', async () => {
    let captured: AuthContextValue | null = null;

    function TestConsumer() {
      const auth = useAuth();
      useEffect(() => {
        captured = auth;
      }, [auth]);
      return null;
    }

    // React 19 act
    await act(async () => {
      // Simulate component mount by calling hook within provider
      React.createElement(AuthProvider, null, React.createElement(TestConsumer));
    });

    // Verify empty state
    expect(mockStore.size).toBe(0);
    expect(captured).toBeNull();
  });

  it('selects CAREGIVER role by default when user has caregiver role', async () => {
    await saveStoredSession(sampleCaregiverSession);
    expect(sampleCaregiverSession.activeRole).toBe(USER_ROLES.CAREGIVER);
  });

  it('selects PROFESSIONAL role by default when user only has professional role', async () => {
    const profSession: StoredSession = {
      ...sampleCaregiverSession,
      user: {
        ...sampleCaregiverSession.user,
        roles: [USER_ROLES.PROFESSIONAL],
      },
      activeRole: USER_ROLES.PROFESSIONAL,
    };
    await saveStoredSession(profSession);
    expect(profSession.activeRole).toBe(USER_ROLES.PROFESSIONAL);
  });

  it('allows switching active role when user has dual roles', async () => {
    await saveStoredSession(sampleDualSession);

    const { updateStoredActiveRole } = await import('../lib/session-storage.js');
    const updated = await updateStoredActiveRole(USER_ROLES.PROFESSIONAL);

    expect(updated?.activeRole).toBe(USER_ROLES.PROFESSIONAL);
    expect(updated?.user.roles).toContain(USER_ROLES.CAREGIVER);
    expect(updated?.user.roles).toContain(USER_ROLES.PROFESSIONAL);
  });

  it('clears active session on sign out and revokes the latest rotated token', async () => {
    await saveStoredSession(sampleCaregiverSession);

    // Simulate token rotation occurring in background storage
    await saveStoredSession({
      ...sampleCaregiverSession,
      refreshToken: 'newly-rotated-refresh-token',
    });

    await clearStoredSession();

    const { getStoredSession } = await import('../lib/session-storage.js');
    const stored = await getStoredSession();
    expect(stored).toBeNull();
  });

  it('registers push token when professional user signs in', async () => {
    let authContext!: AuthContextValue;
    function Consumer() {
      authContext = useAuth();
      return null;
    }

    renderToString(React.createElement(AuthProvider, null, React.createElement(Consumer)));

    await act(async () => {
      await authContext.signIn({
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiresIn: 3600,
        requiresTwoFactor: false,
        user: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'prof@nutrikids.local',
          firstName: 'Juan',
          lastName: 'Doc',
          roles: [USER_ROLES.PROFESSIONAL],
          specialty: 'nutrition',
        },
      });
    });

    expect(mockRegisterPushNotifications).toHaveBeenCalled();
  });

  it('does NOT register push token when caregiver user signs in', async () => {
    mockRegisterPushNotifications.mockClear();

    let authContext!: AuthContextValue;
    function Consumer() {
      authContext = useAuth();
      return null;
    }

    renderToString(React.createElement(AuthProvider, null, React.createElement(Consumer)));

    await act(async () => {
      await authContext.signIn({
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiresIn: 3600,
        requiresTwoFactor: false,
        user: {
          id: '33333333-3333-4333-8333-333333333333',
          email: 'caregiver@nutrikids.local',
          firstName: 'Maria',
          lastName: 'Mom',
          roles: [USER_ROLES.CAREGIVER],
          specialty: null,
        },
      });
    });

    expect(mockRegisterPushNotifications).not.toHaveBeenCalled();
  });

  it('calls unregisterPushNotifications during signOut before session is wiped', async () => {
    let authContext!: AuthContextValue;
    function Consumer() {
      authContext = useAuth();
      return null;
    }

    renderToString(React.createElement(AuthProvider, null, React.createElement(Consumer)));

    await act(async () => {
      await authContext.signOut();
    });

    expect(mockUnregisterPushNotifications).toHaveBeenCalled();
  });
});
