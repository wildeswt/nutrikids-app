import React from 'react';
import { renderToString } from 'react-dom/server';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';
import type { PendingSyncItem } from '../hooks/usePendingSyncItems.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
  isOnline: true,
  pendingItems: [] as PendingSyncItem[],
  pendingLoading: false,
  isSyncing: false,
  retryItem: vi.fn(async (_id: string) => {}),
  discardItem: vi.fn(async (_id: string) => {}),
  syncNow: vi.fn(async () => {}),
  syncStatus: {
    pending: 0,
    sending: 0,
    error: 0,
    lastSyncedAt: null as string | null,
  },
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
    canGoBack: mocks.canGoBack,
  }),
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
      id: 'prof-1',
      firstName: 'Carlos',
      lastName: 'Sánchez',
      email: 'carlos@example.com',
      roles: ['PROFESSIONAL'],
      specialty: 'pediatrics',
      licenseNumber: 'MPPS-12345',
    },
    activeRole: 'PROFESSIONAL',
    switchRole: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../context/connection-context.js', () => ({
  useConnection: () => ({
    status: mocks.isOnline ? 'online' : 'offline',
    isOnline: mocks.isOnline,
  }),
}));

vi.mock('../hooks/usePendingSyncItems.js', () => ({
  usePendingSyncItems: () => ({
    items: mocks.pendingItems,
    loading: mocks.pendingLoading,
    pendingCount: mocks.pendingItems.filter((item) => item.status !== 'SENT').length,
    errorCount: mocks.pendingItems.filter((item) => item.status === 'ERROR').length,
    isSyncing: mocks.isSyncing,
    refresh: vi.fn(async () => {}),
    retryItem: mocks.retryItem,
    discardItem: mocks.discardItem,
    syncNow: mocks.syncNow,
  }),
}));

vi.mock('../hooks/useSyncStatus.js', () => ({
  useSyncStatus: () => ({
    ...mocks.syncStatus,
    syncNow: mocks.syncNow,
    refresh: vi.fn(async () => {}),
  }),
}));

vi.mock('../components/LanguageSelector.js', () => ({
  LanguageSelector: () => React.createElement('mock-language-selector'),
}));

import CaregiverPendingSyncScreen from '../app/(caregiver)/pending-sync.js';
import ProfessionalPendingSyncScreen from '../app/(professional)/pending-sync.js';
import ProfessionalProfileScreen from '../app/(professional)/profile.js';

interface TreeNode {
  type?: unknown;
  props?: Record<string, unknown> & { children?: unknown };
}

function findElementByTestId(node: unknown, testId: string): TreeNode | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findElementByTestId(item, testId);
      if (found) return found;
    }
    return null;
  }
  const el = node as TreeNode;
  if (el.props?.['testID'] === testId) {
    return el;
  }
  if (el.props?.children) {
    return findElementByTestId(el.props.children, testId);
  }
  return null;
}

function renderScreen(Component: () => React.ReactElement | null): { html: string; tree: unknown } {
  let tree: unknown = null;
  function Capture() {
    tree = Component();
    return tree as React.ReactElement;
  }
  const html = renderToString(React.createElement(Capture));
  return { html, tree };
}

function mixedSampleItems(): PendingSyncItem[] {
  return [
    {
      id: 'item-checkup',
      kind: 'checkup',
      childId: 'c1',
      childName: 'Mateo',
      status: 'LOCAL',
      measuredAt: '2026-10-18T10:00:00.000Z',
      weightKg: 12.4,
      lengthHeightCm: 88.5,
      position: 'STANDING',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: '2026-10-18T10:00:00.000Z',
      updatedAt: '2026-10-18T10:00:00.000Z',
    },
    {
      id: 'item-followup',
      kind: 'follow-up',
      childId: 'c1',
      childName: 'Mateo',
      status: 'ERROR',
      itemCount: 2,
      nextCheckupDate: '2026-11-25',
      attempts: 1,
      nextAttemptAt: null,
      lastError: 'Vínculo inactivo',
      createdAt: '2026-10-18T11:00:00.000Z',
      updatedAt: '2026-10-18T11:00:00.000Z',
    },
    {
      id: 'item-feeding',
      kind: 'feeding',
      childId: 'c2',
      childName: 'Paciente',
      status: 'ERROR',
      logDate: '2026-10-18',
      mealsPerDay: 3,
      attempts: 1,
      nextAttemptAt: null,
      lastError: 'Consentimiento expirado',
      createdAt: '2026-10-18T12:00:00.000Z',
      updatedAt: '2026-10-18T12:00:00.000Z',
    },
  ];
}

describe('Pendientes de envío común y perfil profesional (NK-62B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnline = true;
    mocks.pendingItems = [];
    mocks.pendingLoading = false;
    mocks.isSyncing = false;
    mocks.canGoBack.mockReturnValue(true);
    mocks.syncStatus = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
  });

  it('muestra los tres tipos (control, seguimiento con próximo control, alimentación) y permite reintentar y descartar', () => {
    mocks.pendingItems = mixedSampleItems();
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const destructive = buttons?.find((btn) => btn.style === 'destructive');
      destructive?.onPress?.();
    });

    const { html, tree } = renderScreen(CaregiverPendingSyncScreen);

    expect(html).toContain('Control del 18 oct 2026 · 12,4 kg · 88,5 cm');
    expect(html).toContain('Seguimiento clínico · 2 tipos');
    expect(html).toContain('Próximo control: 25 nov 2026');
    expect(html).toContain('Alimentación del 18 oct 2026 · 3 comidas');
    expect(html).toContain('Paciente');

    const retryFeeding = findElementByTestId(tree, 'pending-sync-retry-item-feeding');
    (retryFeeding?.props?.onPress as (() => void) | undefined)?.();
    expect(mocks.retryItem).toHaveBeenCalledWith('item-feeding');

    const discardFollowUp = findElementByTestId(tree, 'pending-sync-discard-item-followup');
    (discardFollowUp?.props?.onPress as (() => void) | undefined)?.();
    expect(alertSpy).toHaveBeenCalledWith(
      '¿Descartar este seguimiento?',
      'Este seguimiento no se enviará y se borrará de este dispositivo',
      expect.any(Array),
    );
    expect(mocks.discardItem).toHaveBeenCalledWith('item-followup');

    const discardFeeding = findElementByTestId(tree, 'pending-sync-discard-item-feeding');
    (discardFeeding?.props?.onPress as (() => void) | undefined)?.();
    expect(alertSpy).toHaveBeenCalledWith(
      '¿Descartar esta alimentación?',
      'Este registro no se enviará y se borrará de este dispositivo',
      expect.any(Array),
    );
    expect(mocks.discardItem).toHaveBeenCalledWith('item-feeding');

    alertSpy.mockRestore();
  });

  it('la ruta del profesional usa PendingSyncList con respaldo a Bandeja de Alertas', () => {
    mocks.canGoBack.mockReturnValue(false);
    mocks.pendingItems = mixedSampleItems();

    const { html, tree } = renderScreen(ProfessionalPendingSyncScreen);
    expect(html).toContain('Pendientes de envío');
    expect(html).toContain('Seguimiento clínico · 2 tipos');

    const header = findElementByTestId(tree, 'pending-sync-header');
    (header?.props?.onBack as (() => void) | undefined)?.();
    expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.PROFESSIONAL.ALERTS);
  });

  it('perfil profesional muestra su registro profesional', () => {
    const { html } = renderScreen(ProfessionalProfileScreen);
    expect(html).toContain('Registro MPPS-12345');
  });

  it('perfil profesional muestra «Pendientes de envío (N)» solo si N > 0 o hay errores y navega a pendientes', () => {
    const empty = renderScreen(ProfessionalProfileScreen);
    expect(findElementByTestId(empty.tree, 'profile-link-pendingSync')).toBeNull();

    mocks.syncStatus = { pending: 1, sending: 1, error: 0, lastSyncedAt: null };
    const withPending = renderScreen(ProfessionalProfileScreen);
    expect(withPending.html).toContain('Pendientes de envío (2)');
    const row = findElementByTestId(withPending.tree, 'profile-link-pendingSync');
    expect(row).not.toBeNull();
    (row?.props?.onPress as (() => void) | undefined)?.();
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.PROFESSIONAL.PENDING_SYNC);

    mocks.syncStatus = { pending: 0, sending: 0, error: 1, lastSyncedAt: null };
    const withError = renderScreen(ProfessionalProfileScreen);
    expect(findElementByTestId(withError.tree, 'profile-link-pendingSync')).not.toBeNull();
  });
});
