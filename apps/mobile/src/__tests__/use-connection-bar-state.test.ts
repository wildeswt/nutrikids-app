import type * as ReactType from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookRuntime = vi.hoisted(() => {
  type CleanupFn = void | (() => void);
  interface EffectEntry {
    deps: unknown[] | undefined;
    fn: () => CleanupFn;
    cleanup: CleanupFn;
  }

  let cursor = 0;
  let effectCursor = 0;
  let states: unknown[] = [];
  let refs: Array<{ current: unknown }> = [];
  let callbacks: Array<{ deps: unknown[]; fn: unknown }> = [];
  let effects: EffectEntry[] = [];
  let pendingEffectIndices: number[] = [];
  let needsRerender = false;
  let mounted = false;
  let activeRunner: (() => unknown) | null = null;
  let latestValue: unknown = null;

  function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
    if (!prev || !next || prev.length !== next.length) return true;
    return next.some((item, index) => !Object.is(item, prev[index]));
  }

  function flushEffects() {
    while (pendingEffectIndices.length > 0 && mounted) {
      const queue = [...pendingEffectIndices];
      pendingEffectIndices = [];
      for (const index of queue) {
        const entry = effects[index];
        if (!entry) continue;
        if (typeof entry.cleanup === 'function') {
          entry.cleanup();
        }
        entry.cleanup = entry.fn();
      }
      if (needsRerender && mounted) {
        needsRerender = false;
        runRenderCycle();
      }
    }
  }

  function runRenderCycle() {
    if (!activeRunner || !mounted) return;
    cursor = 0;
    effectCursor = 0;
    needsRerender = false;
    latestValue = activeRunner();
    flushEffects();
  }

  return {
    reset() {
      cursor = 0;
      effectCursor = 0;
      states = [];
      refs = [];
      callbacks = [];
      effects = [];
      pendingEffectIndices = [];
      needsRerender = false;
      mounted = false;
      activeRunner = null;
      latestValue = null;
    },
    mount<T>(hookFn: () => T): {
      result: { current: T };
      rerender: () => void;
      unmount: () => void;
    } {
      this.reset();
      mounted = true;
      activeRunner = hookFn;
      const result = {
        get current(): T {
          return latestValue as T;
        },
      };
      runRenderCycle();
      return {
        result,
        rerender: () => {
          runRenderCycle();
        },
        unmount: () => {
          mounted = false;
          for (const entry of effects) {
            if (typeof entry.cleanup === 'function') {
              entry.cleanup();
              entry.cleanup = undefined;
            }
          }
        },
      };
    },
    useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((prev: T) => T)) => {
        if (!mounted) return;
        const prevValue = states[index] as T;
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prevValue) : next;
        if (!Object.is(prevValue, resolved)) {
          states[index] = resolved;
          needsRerender = true;
          if (pendingEffectIndices.length === 0) {
            runRenderCycle();
          }
        }
      };
      return [states[index] as T, setState];
    },
    useRef<T>(initial: T): { current: T } {
      const index = cursor++;
      if (!(index in refs)) {
        refs[index] = { current: initial };
      }
      return refs[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]): T {
      const index = cursor++;
      const existing = callbacks[index];
      if (!existing || depsChanged(existing.deps, deps)) {
        callbacks[index] = { deps, fn };
      }
      return callbacks[index]!.fn as T;
    },
    useEffect(fn: () => CleanupFn, deps?: unknown[]) {
      const index = effectCursor++;
      const existing = effects[index];
      if (!existing || depsChanged(existing.deps, deps)) {
        effects[index] = {
          deps,
          fn,
          cleanup: existing?.cleanup,
        };
        pendingEffectIndices.push(index);
      }
    },
  };
});

const mocks = vi.hoisted(() => ({
  isOnline: true,
  syncState: {
    pending: 0,
    sending: 0,
    error: 0,
    lastSyncedAt: null as string | null,
  },
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof ReactType>('react');
  return {
    ...actual,
    useState: hookRuntime.useState,
    useRef: hookRuntime.useRef,
    useCallback: hookRuntime.useCallback,
    useEffect: hookRuntime.useEffect,
  };
});

vi.mock('../context/connection-context.js', () => ({
  useConnection: () => ({
    status: mocks.isOnline ? 'online' : 'offline',
    isOnline: mocks.isOnline,
  }),
}));

vi.mock('../hooks/useSyncStatus.js', () => ({
  useSyncStatus: () => ({
    ...mocks.syncState,
    syncNow: vi.fn(async () => {}),
  }),
}));

import { useConnectionBarState } from '../hooks/useConnectionBarState.js';
import { SYNCED_BANNER_DURATION_MS } from '../lib/connection-bar.js';

describe('useConnectionBarState (NK-29)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.isOnline = true;
    mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
  });

  afterEach(() => {
    hookRuntime.reset();
    vi.useRealTimers();
  });

  it('inicia oculto sin activar temporizador cuando la cola comienza vacía', () => {
    const hook = hookRuntime.mount(() => useConnectionBarState());
    expect(hook.result.current).toEqual({ kind: 'hidden', count: 0 });
    expect(vi.getTimerCount()).toBe(0);
    hook.unmount();
  });

  it('muestra «synced» durante 3 segundos al pasar de > 0 a 0 con conexión', () => {
    mocks.syncState = { pending: 1, sending: 1, error: 0, lastSyncedAt: null };
    const hook = hookRuntime.mount(() => useConnectionBarState());

    expect(hook.result.current).toEqual({ kind: 'sending', count: 2 });

    mocks.syncState = {
      pending: 0,
      sending: 0,
      error: 0,
      lastSyncedAt: '2026-11-14T20:00:00.000Z',
    };
    hook.rerender();

    expect(hook.result.current).toEqual({ kind: 'synced', count: 0 });
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(SYNCED_BANNER_DURATION_MS - 1);
    expect(hook.result.current).toEqual({ kind: 'synced', count: 0 });

    vi.advanceTimersByTime(1);
    expect(hook.result.current).toEqual({ kind: 'hidden', count: 0 });
    expect(vi.getTimerCount()).toBe(0);

    hook.unmount();
  });

  it('no activa «synced» si la cola baja a 0 estando sin conexión', () => {
    mocks.isOnline = false;
    mocks.syncState = { pending: 2, sending: 0, error: 0, lastSyncedAt: null };
    const hook = hookRuntime.mount(() => useConnectionBarState());

    expect(hook.result.current).toEqual({ kind: 'offline', count: 2 });

    mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    hook.rerender();

    expect(hook.result.current).toEqual({ kind: 'offline', count: 0 });
    expect(vi.getTimerCount()).toBe(0);

    mocks.isOnline = true;
    hook.rerender();
    expect(hook.result.current).toEqual({ kind: 'hidden', count: 0 });

    hook.unmount();
  });

  it('reinicia el temporizador si entra otro envío antes de cumplirse los 3 segundos', () => {
    mocks.syncState = { pending: 1, sending: 0, error: 0, lastSyncedAt: null };
    const hook = hookRuntime.mount(() => useConnectionBarState());

    mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    hook.rerender();
    expect(hook.result.current).toEqual({ kind: 'synced', count: 0 });

    vi.advanceTimersByTime(2_000);
    expect(hook.result.current).toEqual({ kind: 'synced', count: 0 });

    // Llega un nuevo registro antes de expirar los 3 segundos.
    mocks.syncState = { pending: 1, sending: 0, error: 0, lastSyncedAt: null };
    hook.rerender();
    expect(hook.result.current).toEqual({ kind: 'sending', count: 1 });
    expect(vi.getTimerCount()).toBe(0);

    // Termina el nuevo envío y vuelve a contar 3 segundos completos.
    mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    hook.rerender();
    expect(hook.result.current).toEqual({ kind: 'synced', count: 0 });

    vi.advanceTimersByTime(2_999);
    expect(hook.result.current).toEqual({ kind: 'synced', count: 0 });

    vi.advanceTimersByTime(1);
    expect(hook.result.current).toEqual({ kind: 'hidden', count: 0 });
    expect(vi.getTimerCount()).toBe(0);

    hook.unmount();
  });

  it('limpia el temporizador pendiente al desmontar sin dejar timers colgados', () => {
    mocks.syncState = { pending: 0, sending: 1, error: 0, lastSyncedAt: null };
    const hook = hookRuntime.mount(() => useConnectionBarState());

    mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    hook.rerender();

    expect(hook.result.current).toEqual({ kind: 'synced', count: 0 });
    expect(vi.getTimerCount()).toBe(1);

    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(SYNCED_BANNER_DURATION_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});
