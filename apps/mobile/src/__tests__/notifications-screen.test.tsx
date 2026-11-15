import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseNotificationsResult } from '../hooks/useNotifications.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
  hookResult: {
    notifications: [],
    loading: false,
    refreshing: false,
    error: null,
    unreadCount: 0,
    reload: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    markAsRead: vi.fn(async () => {}),
  } as UseNotificationsResult,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
    canGoBack: mocks.canGoBack,
  }),
  useFocusEffect: vi.fn((cb: () => void) => cb?.()),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../hooks/useNotifications.js', () => ({
  useNotifications: () => mocks.hookResult,
}));

import { NotificationsScreen } from '../components/NotificationsScreen.js';
import i18n from '../i18n/index.js';

interface ElementWithProps {
  props?: {
    testID?: string;
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

describe('NotificationsScreen Component (NK-36)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders top bar with back button and navigates back on press', () => {
    mocks.hookResult = {
      ...mocks.hookResult,
      notifications: [],
      loading: false,
      error: null,
    };

    let capturedTree: unknown = null;
    function TestWrapper() {
      capturedTree = NotificationsScreen();
      return null;
    }
    renderToString(React.createElement(TestWrapper));

    const backButton = findElementByTestId(capturedTree, 'notifications-back-button');
    expect(backButton).toBeDefined();

    const onPress = backButton?.props?.['onPress'] as (() => void) | undefined;
    onPress?.();
    expect(mocks.back).toHaveBeenCalled();
  });

  it('renders loading state when loading is true', () => {
    mocks.hookResult = {
      ...mocks.hookResult,
      loading: true,
      refreshing: false,
      notifications: [],
      error: null,
    };

    const html = renderToString(React.createElement(NotificationsScreen));
    expect(html).toContain(i18n.t('common:notifications.loading'));
  });

  it('renders error message and retry button when error is present', () => {
    mocks.hookResult = {
      ...mocks.hookResult,
      loading: false,
      error: 'Error de conexion con el servidor',
      notifications: [],
    };

    const html = renderToString(React.createElement(NotificationsScreen));
    expect(html).toContain('Error de conexion con el servidor');
    expect(html).toContain(i18n.t('common:notifications.retry'));
  });

  it('renders empty state when there are no notifications', () => {
    mocks.hookResult = {
      ...mocks.hookResult,
      loading: false,
      error: null,
      notifications: [],
    };

    const html = renderToString(React.createElement(NotificationsScreen));
    expect(html).toContain(i18n.t('common:notifications.empty'));
    expect(html).toContain(i18n.t('common:notifications.emptyDescription'));
  });

  it('renders notification list with unread indicator dot and triggers markAsRead on press', () => {
    const unreadItem = {
      id: 'notif-1',
      userId: 'user-1',
      type: 'alert_new',
      entityType: 'alert',
      entityId: 'alert-1',
      sentAt: '2026-11-14T08:00:00.000Z',
      readAt: null,
    };

    const readItem = {
      id: 'notif-2',
      userId: 'user-1',
      type: 'alert_overdue',
      entityType: 'alert',
      entityId: 'alert-2',
      sentAt: '2026-11-13T08:00:00.000Z',
      readAt: '2026-11-13T09:00:00.000Z',
    };

    mocks.hookResult = {
      ...mocks.hookResult,
      loading: false,
      error: null,
      notifications: [unreadItem, readItem],
    };

    // Rendered list
    const html = renderToString(React.createElement(NotificationsScreen));
    expect(html).toContain(i18n.t('common:notifications.types.alert_new'));
    expect(html).toContain(i18n.t('common:notifications.types.alert_overdue'));
  });

  describe('opening an alert from a notification (NK-33)', () => {
    const base = {
      userId: 'user-1',
      sentAt: '2026-11-14T08:00:00.000Z',
    };
    const alertId = '22222222-2222-4222-8222-222222222222';

    function renderItemOf(item: unknown) {
      let tree: unknown = null;
      function Capture() {
        tree = NotificationsScreen();
        return null;
      }
      renderToString(React.createElement(Capture));
      const list = findByProp(tree, 'renderItem');
      const renderItem = list?.props?.['renderItem'] as (arg: { item: unknown }) => {
        props: { onPress: () => void };
      };
      return renderItem({ item });
    }

    function findByProp(node: unknown, prop: string): ElementWithProps | null {
      if (!node || typeof node !== 'object') return null;
      const element = node as ElementWithProps;
      if (element.props?.[prop] !== undefined) return element;
      const children = element.props?.children;
      for (const child of Array.isArray(children) ? children : [children]) {
        const found = findByProp(child, prop);
        if (found) return found;
      }
      return null;
    }

    it('marks it as read and opens the alert detail with the alert id', () => {
      mocks.hookResult = { ...mocks.hookResult, loading: false, error: null, notifications: [] };

      renderItemOf({
        ...base,
        id: 'notif-1',
        type: 'alert_new',
        entityType: 'alert',
        entityId: alertId,
        readAt: null,
      }).props.onPress();

      expect(mocks.hookResult.markAsRead).toHaveBeenCalledWith('notif-1');
      expect(mocks.push).toHaveBeenCalledWith({
        pathname: '/(professional)/alert-detail',
        params: { alertId },
      });
    });

    it('opens the alert even when the notification was already read', () => {
      mocks.hookResult = { ...mocks.hookResult, loading: false, error: null, notifications: [] };

      renderItemOf({
        ...base,
        id: 'notif-2',
        type: 'alert_overdue',
        entityType: 'alert',
        entityId: alertId,
        readAt: '2026-11-14T09:00:00.000Z',
      }).props.onPress();

      expect(mocks.hookResult.markAsRead).not.toHaveBeenCalled();
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });

    it('opens the reminders screen for reminder notifications', () => {
      mocks.hookResult = { ...mocks.hookResult, loading: false, error: null, notifications: [] };

      renderItemOf({
        ...base,
        id: 'notif-3',
        type: 'reminder_due',
        entityType: 'reminder',
        entityId: alertId,
        readAt: null,
      }).props.onPress();

      expect(mocks.push).toHaveBeenCalledWith('/(caregiver)/reminders');
    });

    it('opens the messages list for message notifications', () => {
      mocks.hookResult = { ...mocks.hookResult, loading: false, error: null, notifications: [] };

      renderItemOf({
        ...base,
        id: 'notif-4',
        type: 'message_new',
        entityType: 'message',
        entityId: alertId,
        readAt: null,
      }).props.onPress();

      expect(mocks.push).toHaveBeenCalledWith('/(professional)/messages');
    });
  });
});
