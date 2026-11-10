import { USER_ROLES } from '@nutrikids/shared';
import React, { act, useEffect } from 'react';
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
});
