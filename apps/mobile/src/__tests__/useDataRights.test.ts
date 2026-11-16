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

import { useDataRights } from '../hooks/useDataRights.js';
import * as dataRightsApi from '../lib/data-rights-api.js';
import * as historyExport from '../lib/history-export.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';

const pending = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: CHILD_ID,
  status: 'pending' as const,
  requestedAt: '2026-11-14T10:00:00.000Z',
  dueAt: '2026-11-29T10:00:00.000Z',
  resolvedAt: null,
};

const child = {
  id: CHILD_ID,
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
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

describe('useDataRights hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle with no request and does not fetch on its own', () => {
    const fetchSpy = vi.spyOn(dataRightsApi, 'fetchErasureRequests');
    const hook = capture(() => useDataRights(CHILD_ID));

    expect(hook.current.status).toBe('idle');
    expect(hook.current.requests).toEqual([]);
    expect(hook.current.pendingRequest).toBeNull();
    expect(hook.current.busy).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('load reads the deletion requests of the child', async () => {
    vi.spyOn(dataRightsApi, 'fetchErasureRequests').mockResolvedValueOnce([pending]);
    const hook = capture(() => useDataRights(CHILD_ID));

    await expect(hook.current.load()).resolves.toEqual([pending]);
    expect(dataRightsApi.fetchErasureRequests).toHaveBeenCalledWith(CHILD_ID);
  });

  it('load returns null instead of throwing, also for a user who is not the legal representative', async () => {
    vi.spyOn(dataRightsApi, 'fetchErasureRequests')
      .mockRejectedValueOnce(new dataRightsApi.DataRightsApiError('Sin permiso', 403))
      .mockRejectedValueOnce(new Error('Sin conexión'));
    const hook = capture(() => useDataRights(CHILD_ID));

    await expect(hook.current.load()).resolves.toBeNull();
    await expect(hook.current.load()).resolves.toBeNull();
  });

  it('load does nothing without a child', async () => {
    const fetchSpy = vi.spyOn(dataRightsApi, 'fetchErasureRequests');
    const hook = capture(() => useDataRights(null));

    await expect(hook.current.load()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requestDeletion creates the request for the child', async () => {
    vi.spyOn(dataRightsApi, 'requestErasure').mockResolvedValueOnce(pending);
    const hook = capture(() => useDataRights(CHILD_ID));

    await expect(hook.current.requestDeletion()).resolves.toEqual(pending);
    expect(dataRightsApi.requestErasure).toHaveBeenCalledWith(CHILD_ID);
  });

  it('requestDeletion lets the API error (409, 403) reach the screen', async () => {
    vi.spyOn(dataRightsApi, 'requestErasure').mockRejectedValueOnce(
      new dataRightsApi.DataRightsApiError('Ya existe una solicitud', 409),
    );
    const hook = capture(() => useDataRights(CHILD_ID));

    await expect(hook.current.requestDeletion()).rejects.toThrow('Ya existe una solicitud');
  });

  it('cancelDeletion cancels the given request', async () => {
    const cancelled = { ...pending, status: 'cancelled' as const };
    vi.spyOn(dataRightsApi, 'cancelErasureRequest').mockResolvedValueOnce(cancelled);
    const hook = capture(() => useDataRights(CHILD_ID));

    await expect(hook.current.cancelDeletion(pending.id)).resolves.toEqual(cancelled);
    expect(dataRightsApi.cancelErasureRequest).toHaveBeenCalledWith(CHILD_ID, pending.id);
  });

  it('exportHistory downloads the Excel file and hands it over', async () => {
    const data = new Uint8Array([80, 75]).buffer;
    vi.spyOn(dataRightsApi, 'fetchChildWorkbook').mockResolvedValueOnce({
      fileName: 'nutrikids-historial-mateo-2026-11-14.xlsx',
      data,
    });
    const deliver = vi.spyOn(historyExport, 'deliverHistoryWorkbook').mockResolvedValueOnce();
    const hook = capture(() => useDataRights(CHILD_ID));

    await hook.current.exportHistory();

    expect(dataRightsApi.fetchChildWorkbook).toHaveBeenCalledWith(CHILD_ID);
    expect(deliver).toHaveBeenCalledWith('nutrikids-historial-mateo-2026-11-14.xlsx', data);
  });

  it('exportHistory does not share anything when the download fails', async () => {
    vi.spyOn(dataRightsApi, 'fetchChildWorkbook').mockRejectedValueOnce(
      new dataRightsApi.DataRightsApiError('Sin permiso', 403),
    );
    const deliver = vi.spyOn(historyExport, 'deliverHistoryWorkbook');
    const hook = capture(() => useDataRights(CHILD_ID));

    await expect(hook.current.exportHistory()).rejects.toThrow('Sin permiso');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('rectify sends the changes for the child', async () => {
    vi.spyOn(dataRightsApi, 'rectifyChild').mockResolvedValueOnce({ ...child, firstName: 'Ana' });
    const hook = capture(() => useDataRights(CHILD_ID));

    await expect(hook.current.rectify({ firstName: 'Ana' })).resolves.toMatchObject({
      firstName: 'Ana',
    });
    expect(dataRightsApi.rectifyChild).toHaveBeenCalledWith(CHILD_ID, { firstName: 'Ana' });
  });

  it('the actions need a child', async () => {
    const hook = capture(() => useDataRights(null));

    await expect(hook.current.requestDeletion()).rejects.toThrow('Falta elegir el niño.');
    await expect(hook.current.exportHistory()).rejects.toThrow('Falta elegir el niño.');
    await expect(hook.current.rectify({ firstName: 'Ana' })).rejects.toThrow(
      'Falta elegir el niño.',
    );
  });
});
