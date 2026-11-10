import { USER_ROLES } from '@nutrikids/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

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
  API_BASE_URL,
  authFetch,
  logoutSessionRequest,
  onSessionExpired,
  onSessionRefreshError,
  onSessionUpdated,
  refreshActiveSession,
} from '../lib/api.js';
import {
  clearStoredSession,
  getStoredSession,
  saveStoredSession,
  type StoredSession,
} from '../lib/session-storage.js';

describe('api-auth and token renewal', () => {
  const sampleSession: StoredSession = {
    accessToken: 'valid-access-token',
    refreshToken: 'valid-refresh-token',
    expiresAt: Date.now() + 900_000,
    user: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'user@example.com',
      firstName: 'Ana',
      lastName: 'Gomez',
      roles: [USER_ROLES.CAREGIVER],
      specialty: null,
    },
    activeRole: USER_ROLES.CAREGIVER,
  };

  beforeEach(async () => {
    mockStore.clear();
    await clearStoredSession();
    vi.restoreAllMocks();
  });

  it('injects Authorization Bearer header into requests', async () => {
    await saveStoredSession(sampleSession);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const res = await authFetch('/test-endpoint');
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${API_BASE_URL}/test-endpoint`);
    const headers = new Headers(calledInit.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${sampleSession.accessToken}`);
  });

  it('deduplicates concurrent refresh calls via single-flight mutex', async () => {
    await saveStoredSession(sampleSession);

    let refreshCallsCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCallsCount++;
        // Small delay to simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(
          JSON.stringify({
            requiresTwoFactor: false,
            accessToken: 'rotated-access-token',
            refreshToken: 'rotated-refresh-token',
            expiresIn: 900,
            user: sampleSession.user,
          }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', mockFetch);

    // Call refresh concurrently 3 times
    const [res1, res2, res3] = await Promise.all([
      refreshActiveSession(),
      refreshActiveSession(),
      refreshActiveSession(),
    ]);

    expect(refreshCallsCount).toBe(1);
    expect(res1?.accessToken).toBe('rotated-access-token');
    expect(res2?.accessToken).toBe('rotated-access-token');
    expect(res3?.accessToken).toBe('rotated-access-token');

    const stored = await getStoredSession();
    expect(stored?.accessToken).toBe('rotated-access-token');
    expect(stored?.refreshToken).toBe('rotated-refresh-token');
  });

  it('notifies onSessionUpdated when tokens are refreshed', async () => {
    await saveStoredSession(sampleSession);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          requiresTwoFactor: false,
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
          expiresIn: 900,
          user: sampleSession.user,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', mockFetch);

    const updatedListener = vi.fn();
    const unsubscribe = onSessionUpdated(updatedListener);

    await refreshActiveSession();

    expect(updatedListener).toHaveBeenCalledTimes(1);
    expect(updatedListener).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'fresh-access',
        refreshToken: 'fresh-refresh',
      }),
    );
    unsubscribe();
  });

  it('retries request on 401 when token refresh succeeds', async () => {
    await saveStoredSession(sampleSession);

    let profileCalls = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({
            requiresTwoFactor: false,
            accessToken: 'renewed-access-token',
            refreshToken: 'renewed-refresh-token',
            expiresIn: 900,
            user: sampleSession.user,
          }),
          { status: 200 },
        );
      }

      if (url.includes('/protected-data')) {
        profileCalls++;
        const auth = new Headers(init?.headers).get('Authorization');
        if (auth === `Bearer ${sampleSession.accessToken}`) {
          // First attempt with old token fails
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
        if (auth === 'Bearer renewed-access-token') {
          // Second attempt with renewed token succeeds
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
      }

      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const response = await authFetch('/protected-data');
    expect(response.status).toBe(200);
    expect(profileCalls).toBe(2);
  });

  it('clears session and triggers onSessionExpired when refresh fails', async () => {
    await saveStoredSession(sampleSession);

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return new Response(JSON.stringify({ error: 'Token expired' }), { status: 401 });
      }
      return new Response(null, { status: 401 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const expiredListener = vi.fn();
    const unsubscribe = onSessionExpired(expiredListener);

    const response = await authFetch('/protected-data');
    expect(response.status).toBe(401);
    expect(expiredListener).toHaveBeenCalledTimes(1);

    const stored = await getStoredSession();
    expect(stored).toBeNull();
    unsubscribe();
  });

  it('triggers onSessionRefreshError and retains session on network failure during refresh', async () => {
    await saveStoredSession(sampleSession);

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        throw new Error('Network request failed');
      }
      return new Response(null, { status: 401 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const refreshErrorListener = vi.fn();
    const unsub = onSessionRefreshError(refreshErrorListener);

    const response = await authFetch('/protected-data');
    expect(response.status).toBe(401);
    expect(refreshErrorListener).toHaveBeenCalledTimes(1);
    expect(refreshErrorListener).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Network request failed' }),
    );

    // Unlike 401/403/revoked response, network failure does NOT erase the session
    const stored = await getStoredSession();
    expect(stored).not.toBeNull();
    unsub();
  });

  it('dispatches logout request with refresh token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', mockFetch);

    await logoutSessionRequest('token-to-revoke');

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/logout`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'token-to-revoke' }),
      }),
    );
  });
});
