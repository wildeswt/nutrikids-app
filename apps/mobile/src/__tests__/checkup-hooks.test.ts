import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { useCheckups } from '../hooks/useCheckups.js';
import { useReferenceCurves } from '../hooks/useReferenceCurves.js';
import * as checkupsApi from '../lib/checkups-api.js';
import * as referenceApi from '../lib/reference-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';

const checkup = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: CHILD_ID,
  measuredAt: '2026-11-10T15:00:00.000Z',
  weightKg: 13.4,
  lengthHeightCm: 91.5,
  position: 'STANDING' as const,
  origin: 'CAREGIVER' as const,
  recordedById: '33333333-3333-4333-8333-333333333333',
  correctedCheckupId: null,
  isCurrent: true,
  createdAt: '2026-11-10T15:00:01.000Z',
};

const input = {
  id: checkup.id,
  measuredAt: checkup.measuredAt,
  weightKg: 13.4,
  lengthHeightCm: 91.5,
  position: 'STANDING' as const,
};

function capture<T>(useHook: () => T): { current: T } {
  const captured = {} as { current: T };
  function TestComponent() {
    captured.current = useHook();
    return React.createElement('div', null, 'ok');
  }
  renderToString(React.createElement(TestComponent));
  return captured;
}

describe('useCheckups hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle without a child', () => {
    const hook = capture(() => useCheckups(null));

    expect(hook.current.status).toBe('idle');
    expect(hook.current.checkups).toEqual([]);
    expect(hook.current.error).toBeNull();
    expect(hook.current.saving).toBe(false);
  });

  it('load fetches the checkups of the child and returns them', async () => {
    vi.spyOn(checkupsApi, 'fetchChildCheckups').mockResolvedValueOnce([checkup]);
    const hook = capture(() => useCheckups(CHILD_ID));

    await expect(hook.current.load()).resolves.toEqual([checkup]);
    expect(checkupsApi.fetchChildCheckups).toHaveBeenCalledWith(CHILD_ID);
  });

  it('load does nothing without a child', async () => {
    const spy = vi.spyOn(checkupsApi, 'fetchChildCheckups');
    const hook = capture(() => useCheckups(null));

    await expect(hook.current.load()).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('load returns null instead of throwing when the request fails', async () => {
    vi.spyOn(checkupsApi, 'fetchChildCheckups').mockRejectedValueOnce(new Error('sin red'));
    const hook = capture(() => useCheckups(CHILD_ID));

    await expect(hook.current.load()).resolves.toBeNull();
  });

  it('create sends the input for the child and returns the stored checkup', async () => {
    vi.spyOn(checkupsApi, 'createChildCheckup').mockResolvedValueOnce(checkup);
    const hook = capture(() => useCheckups(CHILD_ID, { autoLoad: false }));

    await expect(hook.current.create(input)).resolves.toEqual(checkup);
    expect(checkupsApi.createChildCheckup).toHaveBeenCalledWith(CHILD_ID, input);
  });

  it('create rethrows the API error so the screen can react to it', async () => {
    const consentError = new checkupsApi.CheckupApiError('falta consentimiento', 403);
    vi.spyOn(checkupsApi, 'createChildCheckup').mockRejectedValueOnce(consentError);
    const hook = capture(() => useCheckups(CHILD_ID, { autoLoad: false }));

    await expect(hook.current.create(input)).rejects.toBe(consentError);
  });

  it('create fails without a child', async () => {
    const spy = vi.spyOn(checkupsApi, 'createChildCheckup');
    const hook = capture(() => useCheckups(null));

    await expect(hook.current.create(input)).rejects.toThrow(
      'Falta elegir el niño para anotar el control.',
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useReferenceCurves hook', () => {
  const curves = {
    version: 'WHO 2006' as const,
    indicator: 'WEIGHT_FOR_AGE' as const,
    sex: 'MALE' as const,
    xAxis: 'age_months' as const,
    curves: { '-3': [], '-2': [], '0': [], '+2': [], '+3': [] },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle and does not request anything without a query', async () => {
    const spy = vi.spyOn(referenceApi, 'fetchReferenceCurves');
    const hook = capture(() => useReferenceCurves(null));

    expect(hook.current.status).toBe('idle');
    await expect(hook.current.load()).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('load requests the curves of the query', async () => {
    vi.spyOn(referenceApi, 'fetchReferenceCurves').mockResolvedValueOnce(curves);
    const hook = capture(() => useReferenceCurves({ indicator: 'WEIGHT_FOR_AGE', sex: 'MALE' }));

    await expect(hook.current.load()).resolves.toEqual(curves);
    expect(referenceApi.fetchReferenceCurves).toHaveBeenCalledWith({
      indicator: 'WEIGHT_FOR_AGE',
      sex: 'MALE',
    });
  });

  it('load sends the position when the query has one', async () => {
    vi.spyOn(referenceApi, 'fetchReferenceCurves').mockResolvedValueOnce(curves);
    const hook = capture(() =>
      useReferenceCurves({
        indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
        sex: 'FEMALE',
        position: 'RECUMBENT',
      }),
    );

    await hook.current.load();

    expect(referenceApi.fetchReferenceCurves).toHaveBeenCalledWith({
      indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
      sex: 'FEMALE',
      position: 'RECUMBENT',
    });
  });

  it('load returns null instead of throwing when the request fails', async () => {
    vi.spyOn(referenceApi, 'fetchReferenceCurves').mockRejectedValueOnce(new Error('sin red'));
    const hook = capture(() => useReferenceCurves({ indicator: 'BMI_FOR_AGE', sex: 'MALE' }));

    await expect(hook.current.load()).resolves.toBeNull();
  });
});
