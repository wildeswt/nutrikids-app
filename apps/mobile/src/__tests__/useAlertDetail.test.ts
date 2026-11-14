import type * as ReactTypes from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHILD_ID, makeCheckup, makeDetail } from './alerts-fixtures.js';

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

import { useAlertDetail } from '../hooks/useAlertDetail.js';
import * as alertsApi from '../lib/alerts-api.js';
import * as checkupsApi from '../lib/checkups-api.js';
import * as childrenApi from '../lib/children-api.js';

const mateo = {
  id: CHILD_ID,
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

const detail = makeDetail();

/** Re-runs the hook against the persisted fake state, like a re-render would. */
function render(alertId: string | null = detail.id) {
  runtime.index = 0;
  runtime.refIndex = 0;
  return useAlertDetail(alertId ?? undefined);
}

describe('useAlertDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    runtime.slots.length = 0;
    runtime.refs.length = 0;
  });

  it('starts loading with nothing loaded', () => {
    const hook = render();
    expect(hook.loading).toBe(true);
    expect(hook.alert).toBeNull();
    expect(hook.error).toBeNull();
  });

  it('loads the alert, the child and the checkups of that child', async () => {
    const fetchAlert = vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(detail);
    const fetchChild = vi.spyOn(childrenApi, 'fetchChild').mockResolvedValue(mateo);
    const checkups = [makeCheckup()];
    const fetchCheckups = vi
      .spyOn(checkupsApi, 'fetchProfessionalCheckups')
      .mockResolvedValue(checkups);

    await render().reload();
    const hook = render();

    expect(fetchAlert).toHaveBeenCalledWith(detail.id);
    expect(fetchChild).toHaveBeenCalledWith(CHILD_ID);
    expect(fetchCheckups).toHaveBeenCalledWith(CHILD_ID);
    expect(hook.alert).toEqual(detail);
    expect(hook.child).toEqual(mateo);
    expect(hook.checkups).toEqual(checkups);
    expect(hook.loading).toBe(false);
    expect(hook.error).toBeNull();
  });

  it('still shows the alert when the child or the checkups fail to load', async () => {
    vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(detail);
    vi.spyOn(childrenApi, 'fetchChild').mockRejectedValue(new Error('boom'));
    vi.spyOn(checkupsApi, 'fetchProfessionalCheckups').mockRejectedValue(new Error('boom'));

    await render().reload();
    const hook = render();

    expect(hook.alert).toEqual(detail);
    expect(hook.child).toBeNull();
    expect(hook.checkups).toBeNull();
    expect(hook.error).toBeNull();
  });

  it('exposes the API error and does not request the rest when the alert fails', async () => {
    vi.spyOn(alertsApi, 'fetchAlertDetail').mockRejectedValue(new Error('Alerta no encontrada'));
    const fetchChild = vi.spyOn(childrenApi, 'fetchChild');

    await render().reload();
    const hook = render();

    expect(hook.error).toBe('Alerta no encontrada');
    expect(hook.alert).toBeNull();
    expect(hook.loading).toBe(false);
    expect(fetchChild).not.toHaveBeenCalled();
  });

  it('reports an error instead of requesting anything without an alert id', async () => {
    const fetchAlert = vi.spyOn(alertsApi, 'fetchAlertDetail');

    await render(null).reload();
    const hook = render(null);

    expect(fetchAlert).not.toHaveBeenCalled();
    expect(hook.error).toBe('No pudimos cargar la alerta. Intenta de nuevo.');
    expect(hook.loading).toBe(false);
  });

  it('marks the alert as reviewed and keeps the updated detail', async () => {
    vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(detail);
    vi.spyOn(childrenApi, 'fetchChild').mockResolvedValue(mateo);
    vi.spyOn(checkupsApi, 'fetchProfessionalCheckups').mockResolvedValue([]);
    const reviewed = makeDetail({ status: 'REVIEWED' });
    const update = vi.spyOn(alertsApi, 'updateAlertStatus').mockResolvedValue(reviewed);

    await render().reload();
    const done = await render().markReviewed();
    const hook = render();

    expect(done).toBe(true);
    expect(update).toHaveBeenCalledWith(detail.id, 'REVIEWED');
    expect(hook.alert?.status).toBe('REVIEWED');
    expect(hook.marking).toBe(false);
    expect(hook.actionError).toBeNull();
  });

  it('keeps the alert and exposes the message when the review fails', async () => {
    vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(detail);
    vi.spyOn(childrenApi, 'fetchChild').mockResolvedValue(mateo);
    vi.spyOn(checkupsApi, 'fetchProfessionalCheckups').mockResolvedValue([]);
    vi.spyOn(alertsApi, 'updateAlertStatus').mockRejectedValue(
      new Error('Transición no permitida'),
    );

    await render().reload();
    const done = await render().markReviewed();
    const hook = render();

    expect(done).toBe(false);
    expect(hook.alert?.status).toBe('PENDING_REVIEW');
    expect(hook.actionError).toBe('Transición no permitida');
    expect(hook.marking).toBe(false);
  });

  it('shows the saving state while the review is in flight', async () => {
    vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(detail);
    vi.spyOn(childrenApi, 'fetchChild').mockResolvedValue(mateo);
    vi.spyOn(checkupsApi, 'fetchProfessionalCheckups').mockResolvedValue([]);
    let finish!: (value: ReturnType<typeof makeDetail>) => void;
    vi.spyOn(alertsApi, 'updateAlertStatus').mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );

    await render().reload();
    const pending = render().markReviewed();
    expect(render().marking).toBe(true);
    finish(makeDetail({ status: 'REVIEWED' }));
    await pending;

    expect(render().marking).toBe(false);
  });

  it('ignores a stale response that resolves after a newer request', async () => {
    let resolveSlow!: (value: ReturnType<typeof makeDetail>) => void;
    vi.spyOn(alertsApi, 'fetchAlertDetail')
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(makeDetail({ status: 'REVIEWED' }));
    vi.spyOn(childrenApi, 'fetchChild').mockResolvedValue(mateo);
    vi.spyOn(checkupsApi, 'fetchProfessionalCheckups').mockResolvedValue([]);

    const slow = render().reload();
    await render().reload();
    resolveSlow(makeDetail({ status: 'PENDING_REVIEW' }));
    await slow;

    expect(render().alert?.status).toBe('REVIEWED');
  });
});
