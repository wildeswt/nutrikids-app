import { USER_ROLES } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  closeDrawer: vi.fn(),
  navigate: vi.fn(),
  signOut: vi.fn(async () => {}),
  switchRole: vi.fn(async () => {}),
  syncNow: vi.fn(async () => {}),
  syncState: {
    pending: 0,
    sending: 0,
    error: 0,
    lastSyncedAt: null as string | null,
  },
  isOnline: true,
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'persona@example.com',
    firstName: 'Ana',
    lastName: 'Pérez',
    roles: ['CAREGIVER', 'PROFESSIONAL'] as Array<'CAREGIVER' | 'PROFESSIONAL'>,
    specialty: 'pediatrics' as const,
  },
  activeRole: 'CAREGIVER' as 'CAREGIVER' | 'PROFESSIONAL',
}));

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
    Modal: ({
      visible,
      children,
      ...rest
    }: {
      visible?: boolean;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => (visible ? React.createElement('mock-modal', rest, children) : null),
  };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('expo-router/drawer', () => ({
  Drawer: Object.assign(
    (props: { children: React.ReactNode }) => React.createElement('mock-drawer', props),
    {
      Screen: (props: Record<string, unknown>) => React.createElement('mock-drawer-screen', props),
    },
  ),
  DrawerContentScrollView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-drawer-scroll', props),
  DrawerItemList: (props: Record<string, unknown>) =>
    React.createElement('mock-drawer-item-list', props),
}));

vi.mock('@react-navigation/drawer', () => ({
  DrawerContentScrollView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-drawer-scroll', props),
  DrawerItemList: (props: Record<string, unknown>) =>
    React.createElement('mock-drawer-item-list', props),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: mocks.user,
    activeRole: mocks.activeRole,
    signOut: mocks.signOut,
    switchRole: mocks.switchRole,
  }),
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
    syncNow: mocks.syncNow,
  }),
}));

vi.mock('../lib/sync/index.js', () => ({
  syncEngine: {
    subscribe: () => () => {},
    getSyncState: () => mocks.syncState,
    syncNow: mocks.syncNow,
  },
}));

vi.mock('../lib/consent-api.js', () => ({
  fetchCaregiverChildren: vi.fn(async () => []),
}));

vi.mock('../components/LanguageSelector.js', () => ({
  LanguageSelector: () => React.createElement('mock-language-selector'),
}));

vi.mock('../components/ConsentChildItem.js', () => ({
  ConsentChildItem: () => React.createElement('mock-consent-child-item'),
}));

import CaregiverProfileScreen from '../app/(caregiver)/profile.js';
import { CustomDrawerContent } from '../app/(professional)/_layout.js';
import ProfessionalProfileScreen from '../app/(professional)/profile.js';
import { SignOutPendingDialog } from '../components/SignOutPendingDialog.js';
import type { SignOutPendingDialogProps } from '../hooks/useSignOutFlow.js';

interface ElementNode {
  type?: unknown;
  props?: {
    testID?: string;
    disabled?: boolean;
    loading?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    onPress?: () => void;
    onGoToPendingSync?: () => void;
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

function findDialogElement(node: unknown): ElementNode | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findDialogElement(item);
      if (found) return found;
    }
    return null;
  }
  const el = node as ElementNode;
  if (el.type === SignOutPendingDialog) return el;
  return findDialogElement(el.props?.children);
}

function makeDialogProps(
  overrides: Partial<SignOutPendingDialogProps> = {},
): SignOutPendingDialogProps {
  return {
    visible: true,
    unsentCount: 2,
    isOnline: true,
    confirmDeleteStep: false,
    busyAction: null,
    syncFailedCount: null,
    canGoToPendingSync: true,
    onSyncAndSignOut: vi.fn(),
    onRequestDeleteConfirm: vi.fn(),
    onConfirmDeleteAndSignOut: vi.fn(),
    onGoToPendingSync: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe('SignOutPendingDialog and sign-out entry points (NK-63)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnline = true;
    mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
    mocks.activeRole = USER_ROLES.CAREGIVER;
  });

  describe('SignOutPendingDialog component', () => {
    it('renders singular and plural unsent counts, body text, and interactive buttons with a11y', () => {
      const singularHtml = renderToString(
        React.createElement(SignOutPendingDialog, makeDialogProps({ unsentCount: 1 })),
      );
      expect(singularHtml).toContain('Tienes 1 registro sin enviar');
      expect(singularHtml).toContain(
        'Si cierras sesión sin enviarlos se borrarán de este teléfono. Sincroniza primero para no perderlos.',
      );

      let tree!: React.ReactNode;
      function Capture() {
        tree = SignOutPendingDialog(makeDialogProps({ unsentCount: 3 }));
        return tree;
      }
      const pluralHtml = renderToString(React.createElement(Capture));
      expect(pluralHtml).toContain('Tienes 3 registros sin enviar');

      const syncBtn = findByTestId(tree, 'sign-out-pending-sync-btn');
      const deleteBtn = findByTestId(tree, 'sign-out-pending-delete-btn');
      const cancelBtn = findByTestId(tree, 'sign-out-pending-cancel-btn');
      const closeBtn = findByTestId(tree, 'sign-out-pending-close');

      expect(syncBtn?.props?.disabled).toBe(false);
      expect(syncBtn?.props?.accessibilityRole).toBe('button');
      expect(syncBtn?.props?.accessibilityLabel).toBe('Sincronizar y salir');
      expect(deleteBtn?.props?.accessibilityRole).toBe('button');
      expect(deleteBtn?.props?.accessibilityLabel).toBe('Salir y borrar datos');
      expect(cancelBtn?.props?.accessibilityRole).toBe('button');
      expect(cancelBtn?.props?.accessibilityLabel).toBe('Cancelar');
      expect(closeBtn?.props?.accessibilityLabel).toBe('Cancelar cierre de sesión');
    });

    it('disables sync action when offline and shows offline helper message', () => {
      let tree!: React.ReactNode;
      function Capture() {
        tree = SignOutPendingDialog(makeDialogProps({ isOnline: false, unsentCount: 2 }));
        return tree;
      }
      const html = renderToString(React.createElement(Capture));

      expect(html).toContain('Necesitas conexión para enviarlos');
      const syncBtn = findByTestId(tree, 'sign-out-pending-sync-btn');
      expect(syncBtn?.props?.disabled).toBe(true);
    });

    it('shows partial sync error count and link to Pendientes de envío', () => {
      const onGoToPendingSync = vi.fn();
      let tree!: React.ReactNode;
      function Capture() {
        tree = SignOutPendingDialog(
          makeDialogProps({
            unsentCount: 3,
            syncFailedCount: 2,
            onGoToPendingSync,
          }),
        );
        return tree;
      }
      const html = renderToString(React.createElement(Capture));

      expect(html).toContain('No se pudieron enviar 2 registros');
      expect(html).toContain('Ir a Pendientes de envío');

      const queueLink = findByTestId(tree, 'sign-out-pending-go-queue');
      queueLink?.props?.onPress?.();
      expect(onGoToPendingSync).toHaveBeenCalledTimes(1);
    });

    it('shows second confirmation step and disables controls while busy', () => {
      let tree!: React.ReactNode;
      function Capture() {
        tree = SignOutPendingDialog(
          makeDialogProps({
            unsentCount: 2,
            confirmDeleteStep: true,
            busyAction: 'delete',
          }),
        );
        return tree;
      }
      const html = renderToString(React.createElement(Capture));

      expect(html).toContain(
        'Se perderán 2 registros que no se han enviado. Esta acción no se puede deshacer',
      );
      const confirmBtn = findByTestId(tree, 'sign-out-pending-confirm-delete-btn');
      const cancelBtn = findByTestId(tree, 'sign-out-pending-confirm-cancel-btn');
      expect(confirmBtn?.props?.disabled).toBe(true);
      expect(cancelBtn?.props?.disabled).toBe(true);
    });
  });

  describe('all three sign-out entry points use useSignOutFlow and SignOutPendingDialog', () => {
    it('wires CaregiverProfileScreen logout through useSignOutFlow and navigates to caregiver pending sync', async () => {
      let tree!: React.ReactNode;
      function Capture() {
        tree = CaregiverProfileScreen();
        return null;
      }

      // Con pendientes: no llama signOut directamente.
      mocks.syncState = { pending: 2, sending: 0, error: 0, lastSyncedAt: null };
      renderToString(React.createElement(Capture));

      const logoutBtn = findByTestId(tree, 'caregiver-logout-button');
      const dialog = findDialogElement(tree);
      expect(logoutBtn).not.toBeNull();
      expect(dialog).not.toBeNull();

      await logoutBtn?.props?.onPress?.();
      expect(mocks.signOut).not.toHaveBeenCalled();

      dialog?.props?.onGoToPendingSync?.();
      expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.PENDING_SYNC);

      // Sin pendientes: cierra sesión directamente.
      mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
      renderToString(React.createElement(Capture));
      await findByTestId(tree, 'caregiver-logout-button')?.props?.onPress?.();
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    });

    it('wires ProfessionalProfileScreen logout through useSignOutFlow and navigates to professional pending sync', async () => {
      mocks.activeRole = USER_ROLES.PROFESSIONAL;
      let tree!: React.ReactNode;
      function Capture() {
        tree = ProfessionalProfileScreen();
        return null;
      }

      mocks.syncState = { pending: 0, sending: 0, error: 1, lastSyncedAt: null };
      renderToString(React.createElement(Capture));

      const logoutBtn = findByTestId(tree, 'professional-logout-button');
      const dialog = findDialogElement(tree);
      expect(logoutBtn).not.toBeNull();
      expect(dialog).not.toBeNull();

      await logoutBtn?.props?.onPress?.();
      expect(mocks.signOut).not.toHaveBeenCalled();

      dialog?.props?.onGoToPendingSync?.();
      expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.PROFESSIONAL.PENDING_SYNC);

      mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
      renderToString(React.createElement(Capture));
      await findByTestId(tree, 'professional-logout-button')?.props?.onPress?.();
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    });

    it('wires CustomDrawerContent logout through useSignOutFlow and navigates within drawer', async () => {
      mocks.activeRole = USER_ROLES.PROFESSIONAL;
      let tree!: React.ReactNode;
      function Capture() {
        tree = CustomDrawerContent({
          navigation: {
            closeDrawer: mocks.closeDrawer,
            navigate: mocks.navigate,
          },
        } as never);
        return null;
      }

      mocks.syncState = { pending: 1, sending: 1, error: 0, lastSyncedAt: null };
      renderToString(React.createElement(Capture));

      const logoutBtn = findByTestId(tree, 'drawer-logout-button');
      const dialog = findDialogElement(tree);
      expect(logoutBtn).not.toBeNull();
      expect(dialog).not.toBeNull();

      await logoutBtn?.props?.onPress?.();
      expect(mocks.signOut).not.toHaveBeenCalled();

      dialog?.props?.onGoToPendingSync?.();
      expect(mocks.closeDrawer).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).toHaveBeenCalledWith('pending-sync');

      mocks.syncState = { pending: 0, sending: 0, error: 0, lastSyncedAt: null };
      renderToString(React.createElement(Capture));
      await findByTestId(tree, 'drawer-logout-button')?.props?.onPress?.();
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    });
  });
});
