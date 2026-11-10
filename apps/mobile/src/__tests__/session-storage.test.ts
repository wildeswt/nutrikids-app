import { USER_ROLES } from '@nutrikids/shared';
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

import {
  clearStoredSession,
  getStoredSession,
  saveStoredSession,
  updateStoredActiveRole,
  updateStoredTokens,
  type StoredSession,
} from '../lib/session-storage.js';

describe('session-storage', () => {
  const sampleSession: StoredSession = {
    accessToken: 'initial-access-token',
    refreshToken: 'initial-refresh-token',
    expiresAt: Date.now() + 900_000,
    user: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'user@example.com',
      firstName: 'Ana',
      lastName: 'Gomez',
      roles: [USER_ROLES.CAREGIVER, USER_ROLES.PROFESSIONAL],
      specialty: 'pediatrics',
    },
    activeRole: USER_ROLES.CAREGIVER,
  };

  beforeEach(async () => {
    mockStore.clear();
    await clearStoredSession();
  });

  it('returns null when no session is stored', async () => {
    const session = await getStoredSession();
    expect(session).toBeNull();
  });

  it('saves and retrieves stored session accurately', async () => {
    await saveStoredSession(sampleSession);
    const retrieved = await getStoredSession();
    expect(retrieved).toEqual(sampleSession);
  });

  it('clears session and returns null if stored payload fails schema validation', async () => {
    // Put corrupt JSON in secure store
    mockStore.set('nutrikids.auth.session', JSON.stringify({ corrupt: true }));

    const session = await getStoredSession();
    expect(session).toBeNull();
    // Verify it was cleared from the store
    expect(mockStore.has('nutrikids.auth.session')).toBe(false);
  });

  it('updates stored tokens and recalculates expiration timestamp', async () => {
    await saveStoredSession(sampleSession);

    const updated = await updateStoredTokens({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    });

    expect(updated).not.toBeNull();
    expect(updated?.accessToken).toBe('new-access-token');
    expect(updated?.refreshToken).toBe('new-refresh-token');
    expect(updated?.expiresAt).toBeGreaterThan(Date.now() + 3500 * 1000);

    const retrieved = await getStoredSession();
    expect(retrieved?.accessToken).toBe('new-access-token');
  });

  it('updates active role when allowed by user roles', async () => {
    await saveStoredSession(sampleSession);

    const updated = await updateStoredActiveRole(USER_ROLES.PROFESSIONAL);
    expect(updated?.activeRole).toBe(USER_ROLES.PROFESSIONAL);

    const retrieved = await getStoredSession();
    expect(retrieved?.activeRole).toBe(USER_ROLES.PROFESSIONAL);
  });

  it('throws an error when trying to activate an unassigned role', async () => {
    const caregiverOnlySession: StoredSession = {
      ...sampleSession,
      user: {
        ...sampleSession.user,
        roles: [USER_ROLES.CAREGIVER],
        specialty: null,
      },
      activeRole: USER_ROLES.CAREGIVER,
    };

    await saveStoredSession(caregiverOnlySession);

    await expect(updateStoredActiveRole(USER_ROLES.PROFESSIONAL)).rejects.toThrow(
      'User does not have role: PROFESSIONAL',
    );
  });

  it('clears stored session properly', async () => {
    await saveStoredSession(sampleSession);
    expect(await getStoredSession()).not.toBeNull();

    await clearStoredSession();
    expect(await getStoredSession()).toBeNull();
  });
});
