import type * as ReactTypes from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHILD_ID, makeAlert } from './alerts-fixtures.js';

// Minimal hook runtime so the hook can run outside a renderer and its state can be inspected
// (the repo has no react-test-renderer / DOM environment).
const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  refs: [] as { current: unknown }[],
  index: 0,
  refIndex: 0,
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
    useCallback: (fn: unknown) => fn,
  };
});

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { useAlerts } from '../hooks/useAlerts.js';
import * as alertsApi from '../lib/alerts-api.js';
import * as childrenApi from '../lib/children-api.js';

const mateo = {
  id: CHILD_ID,
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

/** Re-runs the hook against the persisted fake state, like a re-render would. */
function render(statuses: Parameters<typeof useAlerts>[0] = ['GENERATED', 'PENDING_REVIEW']) {
  runtime.index = 0;
  runtime.refIndex = 0;
  return useAlerts(statuses);
}

describe('useAlerts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    runtime.slots.length = 0;
    runtime.refs.length = 0;
  });

  it('starts loading with an empty list', () => {
    const hook = render();
    expect(hook.loading).toBe(true);
    expect(hook.alerts).toEqual([]);
    expect(hook.error).toBeNull();
  });

  it('loads alerts in server order and maps child ids to names', async () => {
    const alerts = [makeAlert({ id: '22222222-2222-4222-8222-222222222221' }), makeAlert()];
    const fetchAlerts = vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValue(alerts);
    vi.spyOn(childrenApi, 'fetchCaregiverChildren').mockResolvedValue([mateo]);

    await render().reload();
    const hook = render();

    expect(fetchAlerts).toHaveBeenCalledWith({ statuses: ['GENERATED', 'PENDING_REVIEW'] });
    expect(hook.alerts).toEqual(alerts);
    expect(hook.childNames).toEqual({ [CHILD_ID]: 'Mateo Gómez' });
    expect(hook.loading).toBe(false);
    expect(hook.error).toBeNull();
  });

  it('still shows the alerts when the children request fails', async () => {
    vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValue([makeAlert()]);
    vi.spyOn(childrenApi, 'fetchCaregiverChildren').mockRejectedValue(new Error('boom'));

    await render().reload();
    const hook = render();

    expect(hook.alerts).toHaveLength(1);
    expect(hook.childNames).toEqual({});
    expect(hook.error).toBeNull();
  });

  it('exposes the API error and stops loading when alerts fail', async () => {
    vi.spyOn(alertsApi, 'fetchAlerts').mockRejectedValue(new Error('Sin conexión'));
    vi.spyOn(childrenApi, 'fetchCaregiverChildren').mockResolvedValue([mateo]);

    await render().reload();
    const hook = render();

    expect(hook.error).toBe('Sin conexión');
    expect(hook.loading).toBe(false);
  });

  it('refresh keeps the list visible and clears the refreshing flag', async () => {
    vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValue([makeAlert()]);
    vi.spyOn(childrenApi, 'fetchCaregiverChildren').mockResolvedValue([mateo]);

    await render().reload();
    const pending = render().refresh();
    expect(render().refreshing).toBe(true);
    expect(render().alerts).toHaveLength(1);
    await pending;

    expect(render().refreshing).toBe(false);
  });

  it('ignores a stale response that resolves after a newer request', async () => {
    let resolveSlow!: (value: ReturnType<typeof makeAlert>[]) => void;
    const fetchAlerts = vi
      .spyOn(alertsApi, 'fetchAlerts')
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce([makeAlert({ status: 'GENERATED' })]);
    vi.spyOn(childrenApi, 'fetchCaregiverChildren').mockResolvedValue([mateo]);

    const slow = render().reload();
    await render(['GENERATED']).reload();
    resolveSlow([makeAlert({ status: 'PENDING_REVIEW' })]);
    await slow;

    expect(fetchAlerts).toHaveBeenCalledTimes(2);
    expect(render(['GENERATED']).alerts.map((a) => a.status)).toEqual(['GENERATED']);
  });
});
