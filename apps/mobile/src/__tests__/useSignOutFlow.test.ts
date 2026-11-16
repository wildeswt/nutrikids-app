import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookRuntime = vi.hoisted(() => {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0;
  let refIndex = 0;

  return {
    reset() {
      states.length = 0;
      refs.length = 0;
      stateIndex = 0;
      refIndex = 0;
    },
    beginRender() {
      stateIndex = 0;
      refIndex = 0;
    },
    useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void] {
      const idx = stateIndex++;
      if (!(idx in states)) {
        states[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setter = (value: T | ((prev: T) => T)) => {
        const prev = states[idx] as T;
        states[idx] = typeof value === 'function' ? (value as (p: T) => T)(prev) : value;
      };
      return [states[idx] as T, setter];
    },
    useRef<T>(initial: T): { current: T } {
      const idx = refIndex++;
      if (!(idx in refs)) {
        refs[idx] = { current: initial };
      }
      return refs[idx] as { current: T };
    },
  };
});

vi.mock('react', () => ({
  useState: <T>(initial: T | (() => T)) => hookRuntime.useState(initial),
  useRef: <T>(initial: T) => hookRuntime.useRef(initial),
  useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const testMocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  isOnline: true,
  syncState: {
    pending: 0,
    sending: 0,
    error: 0,
    lastSyncedAt: null as string | null,
  },
  syncNow: vi.fn(async () => {}),
  onGoToPendingSync: vi.fn(),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    signOut: testMocks.signOut,
  }),
}));

vi.mock('../context/connection-context.js', () => ({
  useConnection: () => ({
    status: testMocks.isOnline ? 'online' : 'offline',
    isOnline: testMocks.isOnline,
  }),
}));

vi.mock('../lib/sync/index.js', () => ({
  syncEngine: {
    subscribe: () => () => {},
    getSyncState: () => testMocks.syncState,
    syncNow: () => testMocks.syncNow(),
  },
}));

vi.mock('../hooks/useSyncStatus.js', () => ({
  useSyncStatus: () => ({
    ...testMocks.syncState,
    syncNow: () => testMocks.syncNow(),
  }),
}));

import { useSignOutFlow, type UseSignOutFlowResult } from '../hooks/useSignOutFlow.js';

function renderHook(): UseSignOutFlowResult {
  hookRuntime.beginRender();
  return useSignOutFlow({ onGoToPendingSync: testMocks.onGoToPendingSync });
}

describe('useSignOutFlow (NK-63)', () => {
  beforeEach(() => {
    hookRuntime.reset();
    vi.clearAllMocks();
    testMocks.isOnline = true;
    testMocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    testMocks.signOut = vi.fn(async () => {});
    testMocks.syncNow = vi.fn(async () => {});
  });

  it('signs out directly without opening dialog when queue has 0 unsent items', async () => {
    const flow = renderHook();
    await flow.requestSignOut();

    const updated = renderHook();
    expect(updated.dialogVisible).toBe(false);
    expect(testMocks.signOut).toHaveBeenCalledTimes(1);
    expect(testMocks.syncNow).not.toHaveBeenCalled();
  });

  it('opens pending dialog counting LOCAL + SENDING + ERROR items without signing out', async () => {
    testMocks.syncState = { pending: 1, sending: 1, error: 2, lastSyncedAt: null };

    const flow = renderHook();
    await flow.requestSignOut();

    const updated = renderHook();
    expect(updated.dialogVisible).toBe(true);
    expect(updated.unsentCount).toBe(4);
    expect(updated.confirmDeleteStep).toBe(false);
    expect(testMocks.signOut).not.toHaveBeenCalled();
  });

  it('does not trigger syncAndSignOut while offline', async () => {
    testMocks.isOnline = false;
    testMocks.syncState = { pending: 2, sending: 0, error: 0, lastSyncedAt: null };

    let flow = renderHook();
    await flow.requestSignOut();
    flow = renderHook();

    await flow.syncAndSignOut();
    flow = renderHook();

    expect(testMocks.syncNow).not.toHaveBeenCalled();
    expect(testMocks.signOut).not.toHaveBeenCalled();
    expect(flow.dialogVisible).toBe(true);
  });

  it('syncs and signs out when online and all pending items succeed', async () => {
    testMocks.syncState = { pending: 2, sending: 0, error: 1, lastSyncedAt: null };
    testMocks.syncNow = vi.fn(async () => {
      testMocks.syncState = {
        pending: 0,
        sending: 0,
        error: 0,
        lastSyncedAt: '2026-11-14T20:00:00.000Z',
      };
    });

    let flow = renderHook();
    await flow.requestSignOut();
    flow = renderHook();
    expect(flow.unsentCount).toBe(3);

    await flow.syncAndSignOut();
    flow = renderHook();

    expect(testMocks.syncNow).toHaveBeenCalledTimes(1);
    expect(testMocks.signOut).toHaveBeenCalledTimes(1);
    expect(flow.dialogVisible).toBe(false);
  });

  it('keeps user signed in and reports remaining failed count on partial sync failure', async () => {
    testMocks.syncState = { pending: 3, sending: 0, error: 0, lastSyncedAt: null };
    testMocks.syncNow = vi.fn(async () => {
      // 1 enviado, quedan 2 fallidos (1 LOCAL + 1 ERROR)
      testMocks.syncState = { pending: 1, sending: 0, error: 1, lastSyncedAt: null };
    });

    let flow = renderHook();
    await flow.requestSignOut();
    flow = renderHook();

    await flow.syncAndSignOut();
    flow = renderHook();

    expect(testMocks.syncNow).toHaveBeenCalledTimes(1);
    expect(testMocks.signOut).not.toHaveBeenCalled();
    expect(flow.dialogVisible).toBe(true);
    expect(flow.syncFailedCount).toBe(2);

    flow.goToPendingSync();
    flow = renderHook();
    expect(testMocks.onGoToPendingSync).toHaveBeenCalledTimes(1);
    expect(flow.dialogVisible).toBe(false);
  });

  it('requires a second confirmation before deleting and signing out', async () => {
    testMocks.syncState = { pending: 2, sending: 0, error: 0, lastSyncedAt: null };

    let flow = renderHook();
    await flow.requestSignOut();
    flow = renderHook();
    expect(flow.confirmDeleteStep).toBe(false);

    flow.openDeleteConfirmation();
    flow = renderHook();
    expect(flow.confirmDeleteStep).toBe(true);
    expect(testMocks.signOut).not.toHaveBeenCalled();

    await flow.confirmDeleteAndSignOut();
    flow = renderHook();
    expect(testMocks.signOut).toHaveBeenCalledTimes(1);
    expect(flow.dialogVisible).toBe(false);
  });

  it('closes dialog and does nothing when cancelled', async () => {
    testMocks.syncState = { pending: 1, sending: 0, error: 0, lastSyncedAt: null };

    let flow = renderHook();
    await flow.requestSignOut();
    flow = renderHook();
    flow.openDeleteConfirmation();
    flow = renderHook();
    expect(flow.confirmDeleteStep).toBe(true);

    flow.cancelDialog();
    flow = renderHook();
    expect(flow.dialogVisible).toBe(false);
    expect(flow.confirmDeleteStep).toBe(false);
    expect(testMocks.syncNow).not.toHaveBeenCalled();
    expect(testMocks.signOut).not.toHaveBeenCalled();
  });

  it('blocks double taps while an action is in flight', async () => {
    testMocks.syncState = { pending: 2, sending: 0, error: 0, lastSyncedAt: null };

    let resolveSync!: () => void;
    testMocks.syncNow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = () => {
            testMocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
            resolve();
          };
        }),
    );

    let flow = renderHook();
    await flow.requestSignOut();
    flow = renderHook();

    const firstSync = flow.syncAndSignOut();
    flow = renderHook();
    expect(flow.busyAction).toBe('sync');

    // Doble toque en sincronizar, borrar y cancelar mientras está cargando deben ignorarse.
    await flow.syncAndSignOut();
    flow.openDeleteConfirmation();
    await flow.confirmDeleteAndSignOut();
    flow.cancelDialog();
    flow = renderHook();

    expect(testMocks.syncNow).toHaveBeenCalledTimes(1);
    expect(flow.confirmDeleteStep).toBe(false);
    expect(flow.dialogVisible).toBe(true);

    resolveSync();
    await firstSync;
    expect(testMocks.signOut).toHaveBeenCalledTimes(1);
  });
});
