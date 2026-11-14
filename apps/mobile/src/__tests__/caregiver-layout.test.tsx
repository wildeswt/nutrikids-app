import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  Tabs: Object.assign(
    (props: { children: React.ReactNode }) => React.createElement('mock-tabs', props),
    {
      Screen: (props: { name: string; options?: Record<string, unknown> }) =>
        React.createElement('mock-tabs-screen', props),
    },
  ),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

import CaregiverTabsLayout from '../app/(caregiver)/_layout.js';

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

describe('CaregiverTabsLayout', () => {
  function getTabScreens(): TabScreenElement[] {
    let layout!: ReturnType<typeof CaregiverTabsLayout>;
    function Capture() {
      layout = CaregiverTabsLayout();
      return null;
    }
    renderToString(React.createElement(Capture));
    return React.Children.toArray(layout.props.children) as TabScreenElement[];
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
      'messages',
      'chat-detail',
      'profile',
      'consent',
      'add-child',
      'notifications',
      'reminders',
      'add-reminder',
    ]);

    // Auxiliary screens are hidden with `tabBarButton` (not `href: null`, which makes the route
    // unreachable by router.push in expo-router 58).
    for (const name of ['consent', 'add-child', 'notifications', 'reminders', 'add-reminder']) {
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
});
