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
  Tabs: Object.assign(
    (props: { children: React.ReactNode }) => React.createElement('mock-tabs', props),
    {
      Screen: (props: { name: string; options?: Record<string, unknown> }) =>
        React.createElement('mock-tabs-screen', props),
    },
  ),
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
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

import { Tabs } from 'expo-router';
import CaregiverTabsLayout from '../app/(caregiver)/_layout.js';
import { ConnectionBarLayout } from '../components/ConnectionBar.js';

interface TabScreenElement {
  props: {
    name: string;
    options?: {
      href?: string | null;
      title?: string;
      headerTitle?: string;
      tabBarLabel?: () => unknown;
      tabBarButton?: () => unknown;
      tabBarIcon?: (props: { color: string; size: number; focused: boolean }) => React.ReactNode;
    };
  };
}

function findTabsElement(
  node: React.ReactNode,
): React.ReactElement<{ children?: React.ReactNode }> | null {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return null;
  }
  if (node.type === Tabs) {
    return node;
  }
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findTabsElement(child);
    if (found) return found;
  }
  return null;
}

describe('CaregiverTabsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnline = true;
  });

  function getTabScreens(): TabScreenElement[] {
    let layout!: ReturnType<typeof CaregiverTabsLayout>;
    function Capture() {
      layout = CaregiverTabsLayout();
      return null;
    }
    renderToString(React.createElement(Capture));
    const tabsElement = findTabsElement(layout);
    expect(tabsElement).not.toBeNull();
    return React.Children.toArray(tabsElement!.props.children) as TabScreenElement[];
  }

  it('configures exactly the 5 required visible tabs in order and hidden auxiliary screens', () => {
    const screens = getTabScreens();
    const visibleScreens = screens.filter(
      (s) => s.props.options?.href !== null && s.props.options?.tabBarButton === undefined,
    );
    const visibleNames = visibleScreens.map((s) => s.props.name);
    expect(visibleNames).toEqual(['index', 'evolution', 'add-checkup', 'messages', 'profile']);

    const allNames = screens.map((s) => s.props.name);
    expect(allNames).toEqual([
      'index',
      'evolution',
      'add-checkup',
      'checkup-saved',
      'feeding',
      'messages',
      'chat-detail',
      'profile',
      'consent',
      'add-child',
      'notifications',
      'reminders',
      'add-reminder',
      'learn',
      'learn-article',
      'my-data',
      'link-professional',
      'edit-child',
      'privacy',
      'my-children',
      'pending-sync',
    ]);

    // Auxiliary screens are hidden with `tabBarButton` (not `href: null`, which makes the route
    // unreachable by router.push in expo-router 58).
    for (const name of [
      'consent',
      'add-child',
      'notifications',
      'reminders',
      'add-reminder',
      'learn',
      'learn-article',
      'my-data',
      'link-professional',
      'edit-child',
      'privacy',
      'my-children',
      'pending-sync',
    ]) {
      const screen = screens.find((s) => s.props.name === name);
      expect(screen).toBeDefined();
      expect(screen?.props.options?.href).toBeUndefined();
      expect(screen?.props.options?.tabBarButton?.()).toBeNull();
    }
  });

  it('assigns correct tab titles for caregiver navigation', () => {
    const screens = getTabScreens();
    const screensByTitle = screens.reduce<Record<string, string | undefined>>((acc, s) => {
      acc[s.props.name] = s.props.options?.title;
      return acc;
    }, {});

    expect(screensByTitle['index']).toBe('Inicio');
    expect(screensByTitle['evolution']).toBe('Evolución');
    expect(screensByTitle['add-checkup']).toBe('Control');
    expect(screensByTitle['messages']).toBe('Mensajes');
    expect(screensByTitle['profile']).toBe('Perfil');
  });

  it('provides icons for all tabs and prominent central button for add-checkup', () => {
    const screens = getTabScreens();
    const addCheckup = screens.find((s) => s.props.name === 'add-checkup');
    expect(addCheckup).toBeDefined();

    // Central add button hides text label and renders central elevated plus button
    expect(addCheckup?.props.options?.tabBarLabel?.()).toBeNull();

    const centerIcon = addCheckup?.props.options?.tabBarIcon?.({
      color: '#16A34A',
      size: 24,
      focused: false,
    });
    expect(centerIcon).toBeDefined();

    // Regular tabs render icons with color and size
    const homeTab = screens.find((s) => s.props.name === 'index');
    const homeIcon = homeTab?.props.options?.tabBarIcon?.({
      color: '#16A34A',
      size: 24,
      focused: true,
    });
    expect(homeIcon).toBeDefined();
  });

  it('mounts ConnectionBarLayout with caregiver role above the tabs', () => {
    mocks.isOnline = false;
    let layout!: ReturnType<typeof CaregiverTabsLayout>;
    function Capture() {
      layout = CaregiverTabsLayout();
      return layout;
    }
    const html = renderToString(React.createElement(Capture));

    expect(layout.type).toBe(ConnectionBarLayout);
    expect(layout.props.role).toBe(USER_ROLES.CAREGIVER);
    expect(html).toContain('Sin conexión');
    expect(html).toContain('connection-bar');
    expect(APP_ROUTES.CAREGIVER.PENDING_SYNC).toBe('/(caregiver)/pending-sync');
  });
});
