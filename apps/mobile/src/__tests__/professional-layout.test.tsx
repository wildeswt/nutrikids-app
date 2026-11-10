import { USER_ROLES } from '@nutrikids/shared';
import React from 'react';
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
    const layout = ProfessionalDrawerLayout();
    return React.Children.toArray(layout.props.children) as DrawerScreenElement[];
  }

  it('configures the 4 required drawer screens with alerts inbox as first screen', () => {
    const screens = getDrawerScreens();
    const screenNames = screens.map((s) => s.props.name);

    expect(screenNames).toEqual(['index', 'children', 'messages', 'profile']);
    expect(screenNames[0]).toBe('index');
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
  });

  it('renders CustomDrawerContent with professional profile info', () => {
    const content = CustomDrawerContent({} as never);
    expect(content).not.toBeNull();
  });
});
