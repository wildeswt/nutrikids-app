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

import { useChildren } from '../hooks/useChildren.js';
import * as childrenApi from '../lib/children-api.js';

describe('useChildren hook', () => {
  const mockChild = {
    id: '11111111-1111-4111-8111-111111111111',
    firstName: 'Mateo',
    lastName: 'Gómez',
    birthDate: '2023-06-15',
    sex: 'MALE' as const,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes in idle state', () => {
    let captured: ReturnType<typeof useChildren> | undefined;

    function TestComponent() {
      captured = useChildren();
      return React.createElement('div', null, captured.status);
    }

    renderToString(React.createElement(TestComponent));

    expect(captured?.status).toBe('idle');
    expect(captured?.children).toEqual([]);
    expect(captured?.error).toBeNull();
    expect(typeof captured?.load).toBe('function');
    expect(typeof captured?.create).toBe('function');
  });

  it('create function invokes createChild API and returns new child', async () => {
    vi.spyOn(childrenApi, 'createChild').mockResolvedValueOnce(mockChild);

    let captured: ReturnType<typeof useChildren> | undefined;

    function TestComponent() {
      captured = useChildren();
      return React.createElement('div', null, 'ok');
    }

    renderToString(React.createElement(TestComponent));

    const newChildInput = {
      firstName: 'Mateo',
      lastName: 'Gómez',
      birthDate: '2023-06-15',
      sex: 'MALE' as const,
      relationship: 'Padre',
      isLegalRepresentative: true,
      consentTextVersion: 'v1',
    };

    const result = await captured?.create(newChildInput);
    expect(result).toEqual(mockChild);
    expect(childrenApi.createChild).toHaveBeenCalledWith(newChildInput);
  });

  it('load function fetches children and returns the list', async () => {
    vi.spyOn(childrenApi, 'fetchCaregiverChildren').mockResolvedValueOnce([mockChild]);

    let captured: ReturnType<typeof useChildren> | undefined;

    function TestComponent() {
      captured = useChildren();
      return React.createElement('div', null, 'ok');
    }

    renderToString(React.createElement(TestComponent));

    const result = await captured?.load();
    expect(result).toEqual([mockChild]);
    expect(childrenApi.fetchCaregiverChildren).toHaveBeenCalled();
  });
});
