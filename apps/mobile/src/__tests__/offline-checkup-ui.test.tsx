import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaregiverCheckupListItem } from '../lib/offline-cache.js';
import type { PendingSyncItem } from '../lib/offline-checkup.js';
import { APP_ROUTES } from '../constants/routes.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
  searchParams: {} as Record<string, string>,
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
  evolutionCheckups: [] as CaregiverCheckupListItem[],
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
  useLocalSearchParams: () => mocks.searchParams,
  useFocusEffect: vi.fn(),
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
      id: '10000000-0000-4000-8000-000000000001',
      firstName: 'Andrea',
      lastName: 'Silva',
      email: 'andrea@example.com',
      roles: ['CAREGIVER'],
    },
    activeRole: 'CAREGIVER',
    switchRole: vi.fn(),
    signOut: vi.fn(),
  }),
  useOptionalAuth: () => ({
    user: {
      id: '10000000-0000-4000-8000-000000000001',
      firstName: 'Andrea',
      lastName: 'Silva',
    },
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
  }),
}));

vi.mock('../lib/consent-api.js', () => ({
  fetchCaregiverChildren: vi.fn(async () => []),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({
    status: 'ready',
    children: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        firstName: 'Mateo',
        lastName: 'Gómez',
        birthDate: '2023-06-15',
        sex: 'MALE',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    error: null,
    load: vi.fn(async () => {}),
  }),
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: () => ({
    status: 'ready',
    checkups: mocks.evolutionCheckups,
    error: null,
    load: vi.fn(async () => mocks.evolutionCheckups),
  }),
}));

vi.mock('../hooks/useReferenceCurves.js', () => ({
  useReferenceCurves: () => ({
    status: 'ready',
    curves: {
      indicator: 'WEIGHT_FOR_AGE',
      sex: 'MALE',
      curves: {
        '-3': [
          { x: 0, y: 2 },
          { x: 60, y: 14 },
        ],
        '-2': [
          { x: 0, y: 2.5 },
          { x: 60, y: 16 },
        ],
        '0': [
          { x: 0, y: 3.3 },
          { x: 60, y: 18.3 },
        ],
        '+2': [
          { x: 0, y: 4.2 },
          { x: 60, y: 21 },
        ],
        '+3': [
          { x: 0, y: 4.8 },
          { x: 60, y: 23 },
        ],
      },
    },
    error: null,
    load: vi.fn(),
  }),
}));

vi.mock('../hooks/useGrowthTrend.js', () => ({
  useGrowthTrend: () => ({
    status: 'idle',
    trends: null,
    error: null,
    load: vi.fn(),
  }),
}));

import CheckupSavedScreen from '../app/(caregiver)/checkup-saved.js';
import EvolutionScreen from '../app/(caregiver)/evolution.js';
import PendingSyncScreen from '../app/(caregiver)/pending-sync.js';
import CaregiverProfileScreen from '../app/(caregiver)/profile.js';

interface ElementWithProps {
  props?: {
    testID?: string;
    disabled?: boolean;
    onPress?: () => void;
    children?: ElementWithProps | ElementWithProps[];
    [key: string]: unknown;
  };
}

function findElementByTestId(node: unknown, testId: string): ElementWithProps | null {
  if (!node || typeof node !== 'object') return null;
  const element = node as ElementWithProps;
  if (element.props?.testID === testId) return element;
  if (Array.isArray(element.props?.children)) {
    for (const child of element.props.children) {
      const found = findElementByTestId(child, testId);
      if (found) return found;
    }
  } else if (element.props?.children) {
    return findElementByTestId(element.props.children, testId);
  }
  return null;
}

function renderScreen(Component: () => React.ReactElement | null) {
  let capturedTree: unknown = null;
  function Wrapper() {
    capturedTree = Component();
    return capturedTree as React.ReactElement;
  }
  const html = renderToString(React.createElement(Wrapper));
  return { html, tree: capturedTree };
}

function samplePendingItems(): PendingSyncItem[] {
  return [
    {
      id: 'item-local',
      childId: '11111111-1111-4111-8111-111111111111',
      childName: 'Mateo',
      status: 'LOCAL',
      measuredAt: '2026-10-18T12:00:00.000Z',
      weightKg: 12.2,
      lengthHeightCm: 97.0,
      position: 'STANDING',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: '2026-10-18T12:00:00.000Z',
      updatedAt: '2026-10-18T12:00:00.000Z',
    },
    {
      id: 'item-error',
      childId: '22222222-2222-4222-8222-222222222222',
      childName: 'Sofía',
      status: 'ERROR',
      measuredAt: '2026-10-17T12:00:00.000Z',
      weightKg: 11.4,
      lengthHeightCm: 88.5,
      position: 'STANDING',
      attempts: 2,
      nextAttemptAt: null,
      lastError: 'Falta consentimiento vigente',
      createdAt: '2026-10-17T12:00:00.000Z',
      updatedAt: '2026-10-17T12:00:00.000Z',
    },
    {
      id: 'item-sent',
      childId: '33333333-3333-4333-8333-333333333333',
      childName: 'Lucía',
      status: 'SENT',
      measuredAt: '2026-10-16T12:00:00.000Z',
      weightKg: 13.0,
      lengthHeightCm: 99.0,
      position: 'STANDING',
      attempts: 1,
      nextAttemptAt: null,
      lastError: null,
      createdAt: '2026-10-16T12:00:00.000Z',
      updatedAt: '2026-10-16T12:00:00.000Z',
    },
  ];
}

describe('NK-61 parte B UI: control guardado, pendientes de envío, evolución y perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnline = true;
    mocks.pendingLoading = false;
    mocks.isSyncing = false;
    mocks.pendingItems = [];
    mocks.syncStatus = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    mocks.searchParams = {
      childId: '11111111-1111-4111-8111-111111111111',
      childName: 'Mateo',
      birthDate: '2023-06-15',
      measuredAt: '2026-10-18T12:00:00.000Z',
      weightKg: '12.2',
      lengthHeightCm: '97',
      position: 'STANDING',
    };
    mocks.evolutionCheckups = [
      {
        id: 'c1111111-1111-4111-8111-111111111111',
        childId: '11111111-1111-4111-8111-111111111111',
        measuredAt: '2026-11-01T10:00:00.000Z',
        weightKg: 12.5,
        lengthHeightCm: 90.0,
        position: 'STANDING',
        origin: 'CAREGIVER',
        recordedById: '10000000-0000-4000-8000-000000000001',
        recordedBy: null,
        correctedCheckupId: null,
        isCurrent: true,
        notes: null,
        createdAt: '2026-11-01T10:00:00.000Z',
      },
    ];
  });

  it('CheckupSavedScreen muestra aviso de pendiente cuando pendingSync=1 y navega a pendientes', () => {
    mocks.searchParams.pendingSync = '1';
    const { html, tree } = renderScreen(CheckupSavedScreen);

    expect(html).toContain('Sin conexión · se enviará al reconectar');
    const notice = findElementByTestId(tree, 'checkup-saved-pending-notice');
    expect(notice).not.toBeNull();
    notice?.props?.onPress?.();
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.PENDING_SYNC);
  });

  it('CheckupSavedScreen NO muestra aviso cuando falta pendingSync', () => {
    const { html, tree } = renderScreen(CheckupSavedScreen);

    expect(html).not.toContain('Sin conexión · se enviará al reconectar');
    expect(findElementByTestId(tree, 'checkup-saved-pending-notice')).toBeNull();
  });

  it('PendingSyncScreen muestra estados, banner sin conexión, reintentar y descartar con confirmación', () => {
    mocks.isOnline = false;
    mocks.pendingItems = samplePendingItems();

    const { html, tree } = renderScreen(PendingSyncScreen);

    expect(html).toContain('Pendientes de envío');
    expect(html).toContain('Sin conexión · 2 controles por enviar');
    expect(html).toContain('Guardado en este dispositivo');
    expect(html).toContain('Error');
    expect(html).toContain('Falta consentimiento vigente');
    expect(html).toContain('Enviado');

    // Solo el ítem ERROR tiene Reintentar y Descartar; el SENT no tiene acciones.
    expect(findElementByTestId(tree, 'pending-sync-retry-item-local')).toBeNull();
    expect(findElementByTestId(tree, 'pending-sync-retry-item-sent')).toBeNull();
    const retryBtn = findElementByTestId(tree, 'pending-sync-retry-item-error');
    const discardBtn = findElementByTestId(tree, 'pending-sync-discard-item-error');
    expect(retryBtn).not.toBeNull();
    expect(discardBtn).not.toBeNull();

    // Deshabilitado sin conexión
    const syncBtnOffline = findElementByTestId(tree, 'pending-sync-sync-now');
    expect(syncBtnOffline?.props?.disabled).toBe(true);

    retryBtn?.props?.onPress?.();
    expect(mocks.retryItem).toHaveBeenCalledWith('item-error');

    discardBtn?.props?.onPress?.();
    // Pressing only opens the ConfirmDialog; nothing is discarded until the user confirms.
    expect(mocks.discardItem).not.toHaveBeenCalled();
    const dialog = findElementByTestId(tree, 'pending-sync-discard-dialog');
    expect(dialog?.props?.['tone']).toBe('danger');
  });

  it('PendingSyncScreen habilita Sincronizar ahora en línea y muestra estado vacío', () => {
    mocks.isOnline = true;
    mocks.pendingItems = [];

    const { html, tree } = renderScreen(PendingSyncScreen);
    expect(html).toContain('No tienes controles pendientes');
    expect(findElementByTestId(tree, 'pending-sync-offline-banner')).toBeNull();

    const syncBtn = findElementByTestId(tree, 'pending-sync-sync-now');
    expect(syncBtn?.props?.disabled).toBe(false);
    syncBtn?.props?.onPress?.();
    expect(mocks.syncNow).toHaveBeenCalledTimes(1);
  });

  it('Profile muestra «Pendientes de envío (N)» solo cuando N > 0 o hay errores', () => {
    const hidden = renderScreen(CaregiverProfileScreen);
    expect(findElementByTestId(hidden.tree, 'profile-link-pendingSync')).toBeNull();

    mocks.syncStatus = { pending: 2, sending: 0, error: 0, lastSyncedAt: null };
    const withPending = renderScreen(CaregiverProfileScreen);
    expect(withPending.html).toContain('Pendientes de envío (2)');
    const row = findElementByTestId(withPending.tree, 'profile-link-pendingSync');
    expect(row).not.toBeNull();
    row?.props?.onPress?.();
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.PENDING_SYNC);

    mocks.syncStatus = { pending: 0, sending: 0, error: 1, lastSyncedAt: null };
    const withErrorOnly = renderScreen(CaregiverProfileScreen);
    expect(findElementByTestId(withErrorOnly.tree, 'profile-link-pendingSync')).not.toBeNull();
  });

  it('EvolutionScreen muestra la etiqueta «Guardado en este dispositivo» en controles localOnly', () => {
    mocks.evolutionCheckups = [
      {
        ...mocks.evolutionCheckups[0]!,
        localOnly: true,
      },
    ];

    const { html, tree } = renderScreen(EvolutionScreen);
    expect(html).toContain('Guardado en este dispositivo');
    expect(findElementByTestId(tree, 'evolution-local-only-badge')).not.toBeNull();
  });
});
