import type * as ReactTypes from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Minimal hook harness (same approach as home-summary.test.ts): React hooks are replaced by
 * versions that keep state and memoized callbacks across "renders", so we can check that the
 * functions returned by the hook keep the same identity between renders.
 */
const hookStore = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  reset() {
    this.slots = [];
    this.cursor = 0;
  },
  rewind() {
    this.cursor = 0;
  },
}));

function depsEqual(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  return !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  const memo = <T>(factory: () => T, deps: readonly unknown[]): T => {
    const idx = hookStore.cursor++;
    const prev = hookStore.slots[idx] as { value: T; deps: readonly unknown[] } | undefined;
    if (prev && depsEqual(prev.deps, deps)) return prev.value;
    const value = factory();
    hookStore.slots[idx] = { value, deps };
    return value;
  };
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const idx = hookStore.cursor++;
      if (!(idx in hookStore.slots)) {
        hookStore.slots[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((prev: T) => T)) => {
        hookStore.slots[idx] =
          typeof next === 'function' ? (next as (prev: T) => T)(hookStore.slots[idx] as T) : next;
      };
      return [hookStore.slots[idx] as T, setState];
    },
    useCallback<T>(fn: T, deps: readonly unknown[]) {
      return memo(() => fn, deps);
    },
    useMemo<T>(factory: () => T, deps: readonly unknown[]) {
      return memo(factory, deps);
    },
    useEffect() {
      // Effects are not needed to check identities.
    },
  };
});

vi.mock('../lib/notifications-api.js', () => ({
  fetchNotificationsApi: vi.fn(async () => []),
  markNotificationReadApi: vi.fn(),
}));

import { useNotifications } from '../hooks/useNotifications.js';

function render() {
  hookStore.rewind();
  return useNotifications();
}

describe('useNotifications', () => {
  beforeEach(() => {
    hookStore.reset();
  });

  it('keeps reload, refresh and markAsRead stable between renders', () => {
    // Regression: the caregiver home lists `reload` in useFocusEffect dependencies; a new
    // function per render re-ran the effect forever ("Maximum update depth exceeded").
    const first = render();
    const second = render();
    expect(second.reload).toBe(first.reload);
    expect(second.refresh).toBe(first.refresh);
    expect(second.markAsRead).toBe(first.markAsRead);
  });
});
