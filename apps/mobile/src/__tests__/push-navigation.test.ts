import { USER_ROLES } from '@nutrikids/shared';
import type * as ReactTypes from 'react';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_STATUS } from '../constants/routes.js';

const ALERT_ID = '22222222-2222-4222-8222-222222222222';

// Minimal hook runtime: state and refs persist across fake renders and effects are collected so
// the test decides when they run (the repo has no react-test-renderer / DOM environment).
const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
  refIndex: 0,
  listener: null as null | ((response: unknown) => void),
  remove: vi.fn(),
  lastResponse: null as unknown,
  push: vi.fn(),
  auth: {} as Record<string, unknown>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = runtime.index++;
      if (!(slot in runtime.slots)) runtime.slots[slot] = initial;
      const set = (value: unknown) => {
        runtime.slots[slot] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(runtime.slots[slot])
            : value;
      };
      return [runtime.slots[slot], set];
    },
    useRef: (initial: unknown) => {
      const slot = runtime.refIndex++;
      runtime.refs[slot] ??= { current: initial };
      return runtime.refs[slot];
    },
    useEffect: (effect: () => void | (() => void)) => {
      runtime.effects.push(effect);
    },
  };
});

vi.mock('expo-router', () => ({ useRouter: () => ({ push: runtime.push }) }));
vi.mock('../context/auth-context.js', () => ({ useAuth: () => runtime.auth }));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));
vi.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: vi.fn(async () => runtime.lastResponse),
  addNotificationResponseReceivedListener: vi.fn((cb: (response: unknown) => void) => {
    runtime.listener = cb;
    return { remove: runtime.remove };
  }),
}));

import { usePushNavigation } from '../hooks/usePushNavigation.js';
import { alertIdFromPushResponse } from '../lib/push-notifications.js';

const pushResponse = (data: unknown) => ({ notification: { request: { content: { data } } } });

function setAuth(overrides: Record<string, unknown> = {}) {
  runtime.auth = {
    status: AUTH_STATUS.AUTHENTICATED,
    user: { roles: [USER_ROLES.PROFESSIONAL] },
    activeRole: USER_ROLES.PROFESSIONAL,
    switchRole: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Re-renders the hook and runs the effects of that render, in order. */
function render() {
  runtime.index = 0;
  runtime.refIndex = 0;
  runtime.effects.length = 0;
  usePushNavigation();
  return runtime.effects.map((effect) => effect());
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('alertIdFromPushResponse', () => {
  it('reads the alert id the API sends in the push data', () => {
    expect(
      alertIdFromPushResponse(pushResponse({ alertId: ALERT_ID, notificationId: 'n', type: 'x' })),
    ).toBe(ALERT_ID);
  });

  it.each([
    ['no response', null],
    ['no data', { notification: { request: { content: {} } } }],
    ['data that is not an object', pushResponse('alert')],
    ['no alert id', pushResponse({ notificationId: ALERT_ID })],
    ['a malformed alert id', pushResponse({ alertId: '../../admin' })],
  ])('ignores %s', (_label, response) => {
    expect(alertIdFromPushResponse(response)).toBeNull();
  });
});

describe('usePushNavigation (NK-33)', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('does nothing on web (there is no native push)', () => {
    Platform.OS = 'web';
    setAuth();
    const cleanups = render();
    expect(cleanups[0]).toBeUndefined();
    expect(runtime.listener).toBeNull();
  });

  beforeEach(() => {
    Platform.OS = 'android';
    runtime.slots.length = 0;
    runtime.refs.length = 0;
    runtime.listener = null;
    runtime.lastResponse = null;
    runtime.push.mockClear();
    runtime.remove.mockClear();
    setAuth();
  });

  it('opens the alert when a push is tapped with the app open', () => {
    render();
    runtime.listener?.(pushResponse({ alertId: ALERT_ID }));
    render();

    expect(runtime.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.PROFESSIONAL.ALERT_DETAIL,
      params: { alertId: ALERT_ID },
    });
  });

  it('opens the alert that launched the app, once the session is authenticated', async () => {
    runtime.lastResponse = pushResponse({ alertId: ALERT_ID });
    setAuth({ status: AUTH_STATUS.LOADING, user: null, activeRole: null });

    render();
    await flush();
    render();
    expect(runtime.push).not.toHaveBeenCalled();

    setAuth();
    render();
    expect(runtime.push).toHaveBeenCalledTimes(1);

    render();
    expect(runtime.push).toHaveBeenCalledTimes(1);
  });

  it('switches a dual-role user to the professional view before opening the alert', async () => {
    const switchRole = vi.fn(async () => {});
    setAuth({
      user: { roles: [USER_ROLES.CAREGIVER, USER_ROLES.PROFESSIONAL] },
      activeRole: USER_ROLES.CAREGIVER,
      switchRole,
    });

    render();
    runtime.listener?.(pushResponse({ alertId: ALERT_ID }));
    render();
    render();
    await flush();

    expect(switchRole).toHaveBeenCalledTimes(1);
    expect(switchRole).toHaveBeenCalledWith(USER_ROLES.PROFESSIONAL);
    expect(runtime.push).not.toHaveBeenCalled();

    setAuth({ user: { roles: [USER_ROLES.CAREGIVER, USER_ROLES.PROFESSIONAL] } });
    render();
    expect(runtime.push).toHaveBeenCalledTimes(1);
  });

  it('ignores the tap of a user without the professional role', () => {
    setAuth({ user: { roles: [USER_ROLES.CAREGIVER] }, activeRole: USER_ROLES.CAREGIVER });

    render();
    runtime.listener?.(pushResponse({ alertId: ALERT_ID }));
    render();
    setAuth();
    render();

    expect(runtime.push).not.toHaveBeenCalled();
  });

  it('ignores a push without a valid alert id', () => {
    render();
    runtime.listener?.(pushResponse({ alertId: 'nope' }));
    render();
    expect(runtime.push).not.toHaveBeenCalled();
  });

  it('stops listening when it unmounts', () => {
    const cleanups = render();
    (cleanups[0] as () => void)();
    expect(runtime.remove).toHaveBeenCalled();
  });
});
