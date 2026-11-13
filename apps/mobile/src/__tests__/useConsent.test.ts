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

import { useConsent } from '../hooks/useConsent.js';
import * as consentApi from '../lib/consent-api.js';

describe('useConsent hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockActiveConsent = {
    id: 'a0000000-0000-0000-0000-000000000001',
    childId: 'c0000000-0000-0000-0000-000000000001',
    grantedById: 'u0000000-0000-0000-0000-000000000001',
    textVersion: 'v1',
    grantedAt: '2026-11-12T15:00:00.000Z',
    revokedAt: null,
  };

  it('initializes in idle state if childId is null', () => {
    let captured: ReturnType<typeof useConsent> | undefined;

    function TestComponent() {
      captured = useConsent(null);
      return React.createElement('div', null, captured.status);
    }

    renderToString(React.createElement(TestComponent));
    expect(captured?.status).toBe('idle');
    expect(captured?.consent).toBeNull();
  });

  it('renders initial state for valid childId', () => {
    let captured: ReturnType<typeof useConsent> | undefined;

    function TestComponent() {
      captured = useConsent('c0000000-0000-0000-0000-000000000001');
      return React.createElement('div', null, captured.status);
    }

    renderToString(React.createElement(TestComponent));
    expect(captured?.status).toBe('idle');
    expect(typeof captured?.grant).toBe('function');
    expect(typeof captured?.revoke).toBe('function');
    expect(typeof captured?.load).toBe('function');
  });

  it('grant function calls grantConsentForChild and returns consent', async () => {
    vi.spyOn(consentApi, 'grantConsentForChild').mockResolvedValueOnce(mockActiveConsent);

    let captured: ReturnType<typeof useConsent> | undefined;

    function TestComponent() {
      captured = useConsent('c0000000-0000-0000-0000-000000000001');
      return React.createElement('div', null, 'ok');
    }

    renderToString(React.createElement(TestComponent));

    const result = await captured?.grant('v1');
    expect(result).toEqual(mockActiveConsent);
    expect(consentApi.grantConsentForChild).toHaveBeenCalledWith(
      'c0000000-0000-0000-0000-000000000001',
      'v1',
    );
  });

  it('revoke function calls revokeConsentForChild and returns revoked consent', async () => {
    const revoked = {
      ...mockActiveConsent,
      revokedAt: '2026-11-12T16:00:00.000Z',
    };
    vi.spyOn(consentApi, 'revokeConsentForChild').mockResolvedValueOnce(revoked);

    let captured: ReturnType<typeof useConsent> | undefined;

    function TestComponent() {
      captured = useConsent('c0000000-0000-0000-0000-000000000001');
      return React.createElement('div', null, 'ok');
    }

    renderToString(React.createElement(TestComponent));

    const result = await captured?.revoke();
    expect(result).toEqual(revoked);
    expect(consentApi.revokeConsentForChild).toHaveBeenCalledWith(
      'c0000000-0000-0000-0000-000000000001',
    );
  });
});
