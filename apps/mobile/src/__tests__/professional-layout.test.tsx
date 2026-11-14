import { USER_ROLES } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

import ProfessionalDrawerLayout, { CustomDrawerContent } from '../app/(professional)/_layout.js';

interface DrawerScreenElement {
  props: {
    name: string;
    options?: {
      title?: string;
      drawerLabel?: string;
      drawerIcon?: (props: { color: string; size: number }) => React.ReactNode;
    };
  };
}

describe('ProfessionalDrawerLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    return React.Children.toArray(layout.props.children) as DrawerScreenElement[];
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
    ]);
    expect(screenNames[0]).toBe('index');
  });

  it('hides alert detail, follow-up, referral, and chat detail from the drawer', () => {
    const screens = getDrawerScreens();
    for (const name of ['alert-detail', 'follow-up', 'referral', 'chat-detail']) {
      const options = screens.find((s) => s.props.name === name)?.props.options as
        { drawerItemStyle?: { display?: string }; headerShown?: boolean } | undefined;
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
});
