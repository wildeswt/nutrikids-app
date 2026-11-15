import { USER_ROLES } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  isOnline: true,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mocks for expo-router/drawer and react-navigation
vi.mock('expo-router/drawer', () => ({
  Drawer: Object.assign(
    (props: { children: React.ReactNode; drawerContent?: unknown }) =>
      React.createElement('mock-drawer', props),
    {
      Screen: (props: { name: string; options?: Record<string, unknown> }) =>
        React.createElement('mock-drawer-screen', props),
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

let mockAuthUser = {
  id: 'prof-id',
  email: 'dr.pediatra@example.com',
  firstName: 'Carlos',
  lastName: 'Sánchez',
  roles: [USER_ROLES.PROFESSIONAL],
  specialty: 'pediatrics',
};

const mockSignOut = vi.fn();
const mockSwitchRole = vi.fn();

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    activeRole: USER_ROLES.PROFESSIONAL,
    signOut: mockSignOut,
    switchRole: mockSwitchRole,
  }),
  useOptionalAuth: () => ({
    status: 'authenticated',
    user: mockAuthUser,
    activeRole: USER_ROLES.PROFESSIONAL,
  }),
}));

vi.mock('../context/connection-context.js', () => ({
  useConnection: () => ({
    status: mocks.isOnline ? 'online' : 'offline',
    isOnline: mocks.isOnline,
  }),
}));

import { Drawer } from 'expo-router/drawer';
import ProfessionalDrawerLayout, { CustomDrawerContent } from '../app/(professional)/_layout.js';
import { ConnectionBarLayout } from '../components/ConnectionBar.js';

interface DrawerScreenElement {
  props: {
    name: string;
    options?: {
      title?: string;
      drawerLabel?: string;
      headerShown?: boolean;
      drawerItemStyle?: { display?: string };
      drawerIcon?: (props: { color: string; size: number }) => React.ReactNode;
    };
  };
}

function findDrawerElement(
  node: React.ReactNode,
): React.ReactElement<{ children?: React.ReactNode }> | null {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return null;
  }
  if (node.type === Drawer) {
    return node;
  }
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findDrawerElement(child);
    if (found) return found;
  }
  return null;
}

describe('ProfessionalDrawerLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnline = true;
    mockAuthUser = {
      id: 'prof-id',
      email: 'dr.pediatra@example.com',
      firstName: 'Carlos',
      lastName: 'Sánchez',
      roles: [USER_ROLES.PROFESSIONAL],
      specialty: 'pediatrics',
    };
  });

  function getDrawerScreens(): DrawerScreenElement[] {
    let layout!: ReturnType<typeof ProfessionalDrawerLayout>;
    function Capture() {
      layout = ProfessionalDrawerLayout();
      return null;
    }
    renderToString(React.createElement(Capture));
    const drawerElement = findDrawerElement(layout);
    expect(drawerElement).not.toBeNull();
    return React.Children.toArray(drawerElement!.props.children) as DrawerScreenElement[];
  }

  it('configures the required drawer screens with alerts inbox as first screen', () => {
    const screens = getDrawerScreens();
    const screenNames = screens.map((s) => s.props.name);

    expect(screenNames).toEqual([
      'index',
      'alert-detail',
      'follow-up',
      'referral',
      'children',
      'messages',
      'chat-detail',
      'profile',
      'notifications',
      'pending-sync',
    ]);
    expect(screenNames[0]).toBe('index');
  });

  it('hides alert detail, follow-up, referral, chat detail, and pending sync from the drawer', () => {
    const screens = getDrawerScreens();
    for (const name of ['alert-detail', 'follow-up', 'referral', 'chat-detail', 'pending-sync']) {
      const options = screens.find((s) => s.props.name === name)?.props.options;
      expect(options?.drawerItemStyle).toEqual({ display: 'none' });
      expect(options?.headerShown).toBe(false);
    }
  });

  it('sets accurate drawer labels and titles for professional views', () => {
    const screens = getDrawerScreens();
    const titlesByName = screens.reduce<Record<string, string | undefined>>((acc, s) => {
      acc[s.props.name] = s.props.options?.title;
      return acc;
    }, {});

    expect(titlesByName['index']).toBe('Bandeja de Alertas');
    expect(titlesByName['children']).toBe('Pacientes por Riesgo');
    expect(titlesByName['messages']).toBe('Mensajes y Seguimientos');
    expect(titlesByName['profile']).toBe('Perfil Profesional');
    expect(titlesByName['notifications']).toBe('Notificaciones');
  });

  it('renders CustomDrawerContent with professional profile info', () => {
    let content: ReturnType<typeof CustomDrawerContent> | null = null;
    function Capture() {
      content = CustomDrawerContent({} as never);
      return null;
    }
    renderToString(React.createElement(Capture));
    expect(content).not.toBeNull();
  });

  it('mounts ConnectionBarLayout with professional role above the drawer', () => {
    mocks.isOnline = false;
    let layout!: ReturnType<typeof ProfessionalDrawerLayout>;
    function Capture() {
      layout = ProfessionalDrawerLayout();
      return layout;
    }
    const html = renderToString(React.createElement(Capture));

    expect(layout.type).toBe(ConnectionBarLayout);
    expect(layout.props.role).toBe(USER_ROLES.PROFESSIONAL);
    expect(html).toContain('Sin conexión');
    expect(html).toContain('connection-bar');
    expect(APP_ROUTES.PROFESSIONAL.PENDING_SYNC).toBe('/(professional)/pending-sync');
  });
});
