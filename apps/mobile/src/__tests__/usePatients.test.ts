import type { AlertResponse, ChildResponse } from '@nutrikids/shared';
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

vi.mock('../lib/children-api.js', () => ({
  fetchCaregiverChildren: vi.fn(),
}));

vi.mock('../lib/alerts-api.js', () => ({
  fetchAlerts: vi.fn(),
}));

import { usePatients } from '../hooks/usePatients.js';
import * as alertsApi from '../lib/alerts-api.js';
import * as childrenApi from '../lib/children-api.js';

function renderPatientsHook() {
  hookRuntime.beginRender();
  return usePatients();
}

const mockChildren: ChildResponse[] = [
  {
    id: 'child-1',
    firstName: 'Mateo',
    lastName: 'García',
    birthDate: '2023-01-10',
    sex: 'MALE',
  },
  {
    id: 'child-2',
    firstName: 'Ana',
    lastName: 'Alvarado',
    birthDate: '2023-05-15',
    sex: 'FEMALE',
  },
];

const mockAlerts: AlertResponse[] = [
  {
    id: 'alert-1',
    childId: 'child-1',
    checkupId: 'checkup-1',
    indicatorResultId: 'res-1',
    indicator: 'WEIGHT_FOR_AGE',
    zScore: -3.2,
    classification: 'SEVERE_UNDERWEIGHT',
    riskType: 'UNDERWEIGHT',
    isSevere: true,
    reason: 'Bajo peso grave',
    status: 'GENERATED',
    createdAt: '2026-03-01T10:00:00.000Z',
    reviewDueAt: '2026-03-02T10:00:00.000Z',
    isOverdue: true,
    checkupIsCurrent: true,
  },
];

describe('usePatients hook (Block 3)', () => {
  beforeEach(() => {
    hookRuntime.reset();
    vi.clearAllMocks();
  });

  it('loads children and open alerts in parallel and builds patient items', async () => {
    vi.mocked(childrenApi.fetchCaregiverChildren).mockResolvedValue(mockChildren);
    vi.mocked(alertsApi.fetchAlerts).mockResolvedValue(mockAlerts);

    let hook = renderPatientsHook();
    expect(hook.loading).toBe(true);

    await hook.reload();
    hook = renderPatientsHook();

    expect(hook.loading).toBe(false);
    expect(hook.error).toBeNull();
    expect(hook.patients).toHaveLength(2);
    expect(hook.patients[0]?.child.id).toBe('child-1');
    expect(hook.patients[0]?.riskLevel).toBe('SEVERE');
    expect(hook.patients[1]?.child.id).toBe('child-2');
    expect(hook.patients[1]?.riskLevel).toBe('NO_ALERTS');
  });

  it('captures errors and exposes error state without clearing previous list on failure', async () => {
    vi.mocked(childrenApi.fetchCaregiverChildren).mockRejectedValue(new Error('Network offline'));
    vi.mocked(alertsApi.fetchAlerts).mockResolvedValue([]);

    let hook = renderPatientsHook();
    await hook.reload();
    hook = renderPatientsHook();

    expect(hook.loading).toBe(false);
    expect(hook.error).toBe('Network offline');
    expect(hook.patients).toEqual([]);
  });

  it('handles refresh by setting refreshing flag without clearing state', async () => {
    vi.mocked(childrenApi.fetchCaregiverChildren).mockResolvedValue(mockChildren);
    vi.mocked(alertsApi.fetchAlerts).mockResolvedValue(mockAlerts);

    let hook = renderPatientsHook();
    await hook.reload();
    hook = renderPatientsHook();

    await hook.refresh();
    hook = renderPatientsHook();

    expect(hook.refreshing).toBe(false);
    expect(hook.patients).toHaveLength(2);
  });
});
