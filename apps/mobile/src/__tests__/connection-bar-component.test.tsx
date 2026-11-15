import { USER_ROLES } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StyleSheet } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_STATUS } from '../constants/routes.js';
import type { ConnectionBarState } from '../lib/connection-bar.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  isOnline: true,
  syncState: {
    pending: 0,
    sending: 0,
    error: 0,
    lastSyncedAt: null as string | null,
  },
  authStatus: 'authenticated' as 'loading' | 'authenticated' | 'unauthenticated',
  activeRole: 'CAREGIVER' as 'CAREGIVER' | 'PROFESSIONAL' | null,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  Stack: Object.assign(
    (props: { children: React.ReactNode }) => React.createElement('mock-stack', props),
    {
      Screen: (props: Record<string, unknown>) => React.createElement('mock-stack-screen', props),
    },
  ),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

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

vi.mock('../context/auth-context.js', () => ({
  useOptionalAuth: () => ({
    status: mocks.authStatus,
    activeRole: mocks.activeRole,
  }),
}));

import AuthLayout from '../app/(auth)/_layout.js';
import { ConnectionBar } from '../components/ConnectionBar.js';

interface ElementNode {
  type?: unknown;
  props?: {
    testID?: string;
    name?: string;
    color?: string;
    style?: unknown;
    accessibilityRole?: string;
    accessibilityLiveRegion?: string;
    accessibilityLabel?: string;
    onPress?: () => void;
    children?: unknown;
    [key: string]: unknown;
  };
}

function findByTestId(node: unknown, testId: string): ElementNode | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findByTestId(item, testId);
      if (found) return found;
    }
    return null;
  }
  const el = node as ElementNode;
  if (el.props?.testID === testId) return el;
  return findByTestId(el.props?.children, testId);
}

function findIcon(node: unknown): ElementNode | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findIcon(item);
      if (found) return found;
    }
    return null;
  }
  const el = node as ElementNode;
  if (typeof el.props?.name === 'string') return el;
  return findIcon(el.props?.children);
}

function renderBar(stateOverride?: ConnectionBarState) {
  let tree: React.ReactNode = null;
  function Capture() {
    tree = ConnectionBar(stateOverride ? { state: stateOverride } : {});
    return tree;
  }
  const html = renderToString(React.createElement(Capture));
  const bar = findByTestId(tree, 'connection-bar');
  const icon = findIcon(tree);
  return { tree, html, bar, icon };
}

function resolvePressableStyle(styleProp: unknown): Record<string, unknown> {
  const evaluated = typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return (StyleSheet.flatten(evaluated as never) ?? {}) as Record<string, unknown>;
}

describe('ConnectionBar component (NK-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnline = true;
    mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    mocks.authStatus = AUTH_STATUS.AUTHENTICATED;
    mocks.activeRole = USER_ROLES.CAREGIVER;
  });

  it('no se muestra cuando hay conexión y no hay pendientes ni errores', () => {
    const { html, bar } = renderBar();
    expect(html).toBe('');
    expect(bar).toBeNull();
  });

  it('muestra estado offline sin pendientes con estilo y accesibilidad correctos', () => {
    mocks.isOnline = false;
    const { html, bar, icon } = renderBar();

    expect(html).toContain('Sin conexión');
    expect(html).not.toContain('por enviar');
    expect(html).not.toContain('>Ver<');

    expect(bar).not.toBeNull();
    expect(bar?.props?.accessibilityRole).toBe('button');
    expect(bar?.props?.accessibilityLiveRegion).toBe('polite');
    expect(bar?.props?.accessibilityLabel).toBe('Sin conexión');
    expect(icon?.props?.name).toBe('cloud-offline-outline');

    const flatStyle = resolvePressableStyle(bar?.props?.style);
    expect(flatStyle.backgroundColor).toBe('#575757');
    expect(flatStyle.maxWidth).toBe(368);
    expect(flatStyle.borderRadius).toBe(25);
  });

  it('muestra singular y plural en offline con registros por enviar', () => {
    mocks.isOnline = false;
    mocks.syncState = { pending: 1, sending: 0, error: 0, lastSyncedAt: null };
    const singular = renderBar();
    expect(singular.html).toContain('Sin conexión · 1 registro por enviar');
    expect(singular.bar?.props?.accessibilityLabel).toBe('Sin conexión · 1 registro por enviar');

    mocks.syncState = { pending: 1, sending: 0, error: 1, lastSyncedAt: null };
    const plural = renderBar();
    expect(plural.html).toContain('Sin conexión · 2 registros por enviar');
    expect(plural.bar?.props?.accessibilityLabel).toBe('Sin conexión · 2 registros por enviar');
  });

  it('muestra estado sending con icono, color y singular/plural', () => {
    mocks.syncState = { pending: 0, sending: 1, error: 0, lastSyncedAt: null };
    const singular = renderBar();
    expect(singular.html).toContain('Enviando 1 registro…');
    expect(singular.html).not.toContain('>Ver<');
    expect(singular.icon?.props?.name).toBe('sync-outline');
    expect(singular.bar?.props?.accessibilityLiveRegion).toBe('polite');
    expect(singular.bar?.props?.accessibilityLabel).toBe('Enviando 1 registro…');
    expect(resolvePressableStyle(singular.bar?.props?.style).backgroundColor).toBe('#F77E4D');

    mocks.syncState = { pending: 2, sending: 1, error: 0, lastSyncedAt: null };
    const plural = renderBar();
    expect(plural.html).toContain('Enviando 3 registros…');
  });

  it('muestra estado error con acción «Ver», icono, color y singular/plural', () => {
    mocks.syncState = { pending: 0, sending: 0, error: 1, lastSyncedAt: null };
    const singular = renderBar();
    expect(singular.html).toContain('1 registro no se pudo enviar');
    expect(singular.html).toContain('Ver');
    expect(singular.icon?.props?.name).toBe('alert-circle-outline');
    expect(singular.bar?.props?.accessibilityLiveRegion).toBe('polite');
    expect(singular.bar?.props?.accessibilityLabel).toBe('1 registro no se pudo enviar · Ver');
    expect(resolvePressableStyle(singular.bar?.props?.style).backgroundColor).toBe('#E14100');

    mocks.syncState = { pending: 0, sending: 0, error: 2, lastSyncedAt: null };
    const plural = renderBar();
    expect(plural.html).toContain('2 registros no se pudieron enviar');
    expect(plural.bar?.props?.accessibilityLabel).toBe('2 registros no se pudieron enviar · Ver');
  });

  it('muestra estado synced con icono, color y sin acción «Ver»', () => {
    const { html, bar, icon } = renderBar({ kind: 'synced', count: 0 });
    expect(html).toContain('Todo sincronizado');
    expect(html).not.toContain('>Ver<');
    expect(icon?.props?.name).toBe('checkmark-circle-outline');
    expect(bar?.props?.accessibilityLiveRegion).toBe('polite');
    expect(bar?.props?.accessibilityLabel).toBe('Todo sincronizado');
    expect(resolvePressableStyle(bar?.props?.style).backgroundColor).toBe('#2D5F5A');
  });

  it('navega a Pendientes de envío según el rol actual al tocar la barra', () => {
    mocks.isOnline = false;

    mocks.activeRole = USER_ROLES.CAREGIVER;
    const caregiver = renderBar();
    caregiver.bar?.props?.onPress?.();
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.PENDING_SYNC);

    mocks.push.mockClear();
    mocks.activeRole = USER_ROLES.PROFESSIONAL;
    const professional = renderBar();
    professional.bar?.props?.onPress?.();
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.PROFESSIONAL.PENDING_SYNC);
  });

  it('no se muestra sin sesión ni en el layout de autenticación', () => {
    mocks.isOnline = false;
    mocks.authStatus = AUTH_STATUS.UNAUTHENTICATED;
    const { html, bar } = renderBar();
    expect(html).toBe('');
    expect(bar).toBeNull();

    const authHtml = renderToString(React.createElement(AuthLayout));
    expect(authHtml).not.toContain('connection-bar');
  });
});
