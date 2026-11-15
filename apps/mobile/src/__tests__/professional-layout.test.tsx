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

vi.mock('../context/auth-context.js', () => ({
  useOptionalAuth: () => ({
    status: 'authenticated',
    user: {
      id: 'prof-id',
      email: 'dr.pediatra@example.com',
      firstName: 'Carlos',
      lastName: 'Sánchez',
      roles: [USER_ROLES.PROFESSIONAL],
      specialty: 'pediatrics',
    },
    activeRole: USER_ROLES.PROFESSIONAL,
  }),
}));

vi.mock('../context/connection-context.js', () => ({
  useConnection: () => ({
    status: mocks.isOnline ? 'online' : 'offline',
    isOnline: mocks.isOnline,
  }),
}));

import { Tabs } from 'expo-router';
import ProfessionalTabsLayout from '../app/(professional)/_layout.js';
import { ConnectionBarLayout } from '../components/ConnectionBar.js';

interface TabScreenElement {
  props: {
    name: string;
    options?: {
      title?: string;
      tabBarLabel?: unknown;
      tabBarStyle?: { display?: string };
      tabBarItemStyle?: { display?: string };
      tabBarButton?: () => React.ReactNode;
      tabBarIcon?: (props: { color: string; size: number; focused: boolean }) => React.ReactNode;
    };
  };
}

function findTabsElement(
  node: React.ReactNode,
): React.ReactElement<{
  children?: React.ReactNode;
  screenOptions?: { headerShown?: boolean };
}> | null {
  if (
    !React.isValidElement<{
      children?: React.ReactNode;
      screenOptions?: { headerShown?: boolean };
    }>(node)
  ) {
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

describe('ProfessionalTabsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnline = true;
  });

  function getTabScreens(): TabScreenElement[] {
    let layout!: ReturnType<typeof ProfessionalTabsLayout>;
    function Capture() {
      layout = ProfessionalTabsLayout();
      return null;
    }
    renderToString(React.createElement(Capture));
    const tabsElement = findTabsElement(layout);
    expect(tabsElement).not.toBeNull();
    expect(tabsElement!.props.screenOptions?.headerShown).toBe(false);
    return React.Children.toArray(tabsElement!.props.children) as TabScreenElement[];
  }

  it('configures the 5 bottom tabs in Figma order plus secondary routes', () => {
    const screens = getTabScreens();
    const screenNames = screens.map((s) => s.props.name);

    expect(screenNames).toEqual([
      'index',
      'children',
      'add-checkup',
      'messages',
      'profile',
      'notifications',
      'alert-detail',
      'follow-up',
      'referral',
      'evolution',
      'checkup-history',
      'chat-detail',
      'pending-sync',
    ]);
  });

  it('hides secondary routes from the tab bar while keeping bottom bar on notifications', () => {
    const screens = getTabScreens();
    for (const name of [
      'alert-detail',
      'follow-up',
      'referral',
      'evolution',
      'checkup-history',
      'chat-detail',
      'pending-sync',
    ]) {
      const options = screens.find((s) => s.props.name === name)?.props.options;
      expect(options?.tabBarItemStyle).toEqual({ display: 'none' });
      expect(options?.tabBarStyle).toEqual({ display: 'none' });
      expect(options?.tabBarButton?.()).toBeNull();
    }

    const notificationsOptions = screens.find((s) => s.props.name === 'notifications')?.props
      .options;
    expect(notificationsOptions?.tabBarItemStyle).toEqual({ display: 'none' });
    expect(notificationsOptions?.tabBarButton?.()).toBeNull();
    expect(notificationsOptions?.tabBarStyle).toBeUndefined();
  });

  it('mounts ConnectionBarLayout with professional role above the tabs', () => {
    mocks.isOnline = false;
    let layout!: ReturnType<typeof ProfessionalTabsLayout>;
    function Capture() {
      layout = ProfessionalTabsLayout();
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
