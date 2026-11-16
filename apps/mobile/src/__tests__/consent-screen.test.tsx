import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  params: {} as Record<string, string>,
  consentState: {
    status: 'idle' as 'idle' | 'loading' | 'active' | 'revoked' | 'none' | 'error',
    consent: null as {
      id: string;
      childId: string;
      textVersion: string;
      grantedAt: string;
      revokedAt: string | null;
    } | null,
    error: null as string | null,
  },
  load: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: {} },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: {
      id: 'u0000000-0000-0000-0000-000000000001',
      firstName: 'Andrea',
      lastName: 'Rodríguez',
      email: 'andrea@example.com',
      roles: ['CAREGIVER'],
    },
    activeRole: 'CAREGIVER',
  }),
}));

vi.mock('../hooks/useConsent.js', () => ({
  useConsent: () => ({
    ...mocks.consentState,
    load: mocks.load,
    grant: mocks.grant,
    revoke: mocks.revoke,
  }),
}));

import ConsentScreen from '../app/(caregiver)/consent.js';
import i18n from '../i18n/index.js';

const render = () => renderToString(React.createElement(ConsentScreen));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.consentState = { status: 'idle', consent: null, error: null };
});

describe('ConsentScreen («Consentimiento»)', () => {
  it('shows checkboxes and version/date line in register mode without ChildBanner', () => {
    mocks.params = { mode: 'register' };

    const html = render();

    expect(html).toContain(i18n.t('consent:screen.registerSubtitle'));
    expect(html).not.toContain('consent-child-banner');
    expect(html).not.toContain('consent-metadata');
    expect(html).toContain('consent-version-line');
    expect(html).toContain('Versión 1.0 del texto');
    expect(html).toContain('accept-consent-button');
    expect(html).toContain('decline-consent-button');
  });

  it('shows ChildBanner, metadata card and revoke action in active view mode', () => {
    mocks.params = {
      childId: '11111111-1111-4111-8111-111111111111',
      childName: 'Mateo',
      mode: 'view',
    };
    mocks.consentState = {
      status: 'active',
      consent: {
        id: 'c1',
        childId: '11111111-1111-4111-8111-111111111111',
        textVersion: 'v1',
        grantedAt: '2026-10-18T10:00:00.000Z',
        revokedAt: null,
      },
      error: null,
    };

    const html = render();

    expect(html).toContain('consent-child-banner');
    expect(html).toContain('Andrea Rodríguez');
    expect(html).toContain('consent-metadata');
    expect(html).toContain(i18n.t('consent:screen.statusActive'));
    expect(html).toContain('revoke-consent-button');
    expect(html).not.toContain('consent-version-line');
  });

  it('shows checkboxes, version/date line and renew action when consent is revoked', () => {
    mocks.params = {
      childId: '11111111-1111-4111-8111-111111111111',
      childName: 'Mateo',
      mode: 'view',
    };
    mocks.consentState = {
      status: 'revoked',
      consent: {
        id: 'c1',
        childId: '11111111-1111-4111-8111-111111111111',
        textVersion: 'v1',
        grantedAt: '2026-10-01T10:00:00.000Z',
        revokedAt: '2026-10-18T10:00:00.000Z',
      },
      error: null,
    };

    const html = render();

    expect(html).toContain('consent-child-banner');
    expect(html).toContain('consent-metadata');
    expect(html).toContain(i18n.t('consent:screen.statusRevoked'));
    expect(html).toContain('consent-version-line');
    expect(html).toContain('renew-consent-button');
    expect(html).toContain('decline-consent-button');
  });
});
