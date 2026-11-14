import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';

const MATEO = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

const VALENTINA = {
  id: '44444444-4444-4444-8444-444444444444',
  firstName: 'Valentina',
  lastName: 'Ríos',
  birthDate: '2024-02-10',
  sex: 'FEMALE' as const,
};

const at = (daysFromNow: number, hours: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hours, 0, 0, 0);
  return date.toISOString();
};

const makeReminder = (
  id: string,
  type: string,
  scheduledFor: string,
  status: 'pending' | 'sent' | 'completed',
  childId = MATEO.id,
) => ({ id, childId, type, scheduledFor, status });

const TODAY = makeReminder('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'checkup', at(0, 23), 'sent');
const NEXT = makeReminder(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'activity',
  at(5, 9),
  'pending',
  VALENTINA.id,
);
const DONE = makeReminder(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'next_checkup',
  at(-9, 9),
  'completed',
);

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  params: {} as Record<string, string>,
  focusCallbacks: [] as Array<() => void>,
  load: vi.fn(),
  loadChildren: vi.fn(),
  create: vi.fn(),
  complete: vi.fn(),
  refreshPermission: vi.fn(),
  enable: vi.fn(),
  reminders: {
    status: 'ready',
    reminders: [] as unknown[],
    error: null as string | null,
    completingIds: [] as string[],
  },
  children: {
    status: 'ready',
    children: [] as unknown[],
    error: null as string | null,
  },
  permission: 'granted' as string | null,
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
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
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mocks.params,
  useFocusEffect: (callback: () => void) => {
    mocks.focusCallbacks.push(callback);
  },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({ ...mocks.children, load: mocks.loadChildren, create: vi.fn() }),
}));

vi.mock('../hooks/useReminders.js', () => ({
  useReminders: () => ({
    ...mocks.reminders,
    load: mocks.load,
    create: mocks.create,
    complete: mocks.complete,
  }),
}));

vi.mock('../hooks/useNotificationsPermission.js', () => ({
  useNotificationsPermission: () => ({
    permission: mocks.permission,
    refresh: mocks.refreshPermission,
    enable: mocks.enable,
  }),
}));

import AddReminderScreen from '../app/(caregiver)/add-reminder.js';
import RemindersScreen from '../app/(caregiver)/reminders.js';
import i18n from '../i18n/index.js';

interface ElementWithProps {
  props?: {
    testID?: string;
    children?: unknown;
    [key: string]: unknown;
  };
}

/** Finds an element by testID in the tree returned by calling a component function. */
function findElementByTestId(node: unknown, testId: string): ElementWithProps | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByTestId(child, testId);
      if (found) return found;
    }
    return null;
  }
  const element = node as ElementWithProps;
  if (element.props?.testID === testId) return element;
  return findElementByTestId(element.props?.children, testId);
}

function renderTree(Screen: () => unknown): unknown {
  let tree: unknown = null;
  function Wrapper() {
    tree = Screen();
    return null;
  }
  renderToString(React.createElement(Wrapper));
  return tree;
}

function press(tree: unknown, testId: string) {
  const onPress = findElementByTestId(tree, testId)?.props?.['onPress'] as (() => void) | undefined;
  expect(onPress, `no onPress for ${testId}`).toBeTypeOf('function');
  onPress!();
}

const render = (Screen: () => React.ReactNode) => renderToString(React.createElement(Screen));
const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key as never, options as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.focusCallbacks = [];
  mocks.reminders = {
    status: 'ready',
    reminders: [TODAY, NEXT, DONE],
    error: null,
    completingIds: [],
  };
  mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };
  mocks.permission = 'granted';
});

describe('RemindersScreen («Recordatorios»)', () => {
  it('shows the tabs with their counters', () => {
    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.tabUpcoming', { count: 2 }));
    expect(html).toContain(t('caregiver:reminders.tabCompleted', { count: 1 }));
  });

  it('shows today as a card with «Marcar como realizado»', () => {
    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.todayTitle'));
    expect(html).toContain(t('caregiver:reminders.types.checkup'));
    expect(html).toContain('Mateo Gómez');
    expect(html).toContain(t('caregiver:reminders.markDone'));
  });

  it('marks the reminder as done through the hook', () => {
    press(renderTree(RemindersScreen as () => unknown), `reminder-complete-${TODAY.id}`);

    expect(mocks.complete).toHaveBeenCalledWith(TODAY.id);
  });

  it('lists the next appointments with «Ver cita»', () => {
    const tree = renderTree(RemindersScreen as () => unknown);
    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.upcomingTitle'));
    expect(html).toContain(t('caregiver:reminders.types.activity'));
    expect(html).toContain(t('caregiver:reminders.viewAppointment'));
    expect(findElementByTestId(tree, `reminder-view-${NEXT.id}`)).not.toBeNull();
    // The completed reminder only appears in its own tab.
    expect(findElementByTestId(tree, `reminder-completed-${DONE.id}`)).toBeNull();
  });

  it('lists the completed reminders in the second tab', () => {
    mocks.params = { tab: 'completed' };

    const tree = renderTree(RemindersScreen as () => unknown);

    expect(findElementByTestId(tree, `reminder-completed-${DONE.id}`)).not.toBeNull();
    expect(findElementByTestId(tree, `reminder-upcoming-${NEXT.id}`)).toBeNull();
    expect(render(RemindersScreen)).not.toContain(t('caregiver:reminders.viewAppointment'));
  });

  it('only shows the reminders of the child received in the route', () => {
    mocks.params = { childId: VALENTINA.id };

    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.tabUpcoming', { count: 1 }));
    expect(html).not.toContain(t('caregiver:reminders.todayTitle'));
  });

  it('shows that notifications are enabled', () => {
    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.notifications.enabled'));
    expect(html).not.toContain(t('caregiver:reminders.notifications.enable'));
  });

  it('shows that notifications are disabled, with a button to enable them', () => {
    mocks.permission = 'denied';

    const tree = renderTree(RemindersScreen as () => unknown);
    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.notifications.disabled'));
    press(tree, 'reminders-enable-notifications');
    expect(mocks.enable).toHaveBeenCalledTimes(1);
  });

  it('says the notifications cannot be checked on this device', () => {
    mocks.permission = 'unavailable';

    const tree = renderTree(RemindersScreen as () => unknown);

    expect(render(RemindersScreen)).toContain(t('caregiver:reminders.notifications.unavailable'));
    expect(findElementByTestId(tree, 'reminders-enable-notifications')).toBeNull();
  });

  it('opens the create form from the button, keeping the child filter', () => {
    mocks.params = { childId: MATEO.id };

    press(renderTree(RemindersScreen as () => unknown), 'reminders-create-button');

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.ADD_REMINDER,
      params: { childId: MATEO.id },
    });
  });

  it('reloads reminders, children and the permission every time the screen gains focus', () => {
    render(RemindersScreen);
    mocks.focusCallbacks.at(-1)!();

    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);
    expect(mocks.refreshPermission).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state on the first load', () => {
    mocks.reminders = { status: 'loading', reminders: [], error: null, completingIds: [] };

    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.loading'));
  });

  it('shows the error with a retry that reloads', () => {
    mocks.reminders = { status: 'error', reminders: [], error: 'Sin conexión', completingIds: [] };

    const tree = renderTree(RemindersScreen as () => unknown);
    expect(render(RemindersScreen)).toContain('Sin conexión');

    press(tree, 'reminders-retry');
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it('keeps the list when a refresh fails', () => {
    mocks.reminders = {
      status: 'error',
      reminders: [TODAY],
      error: 'Sin conexión',
      completingIds: [],
    };

    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.markDone'));
  });

  it('shows an empty state when there is nothing to do', () => {
    mocks.reminders = { status: 'ready', reminders: [], error: null, completingIds: [] };

    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.emptyUpcomingTitle'));
    expect(html).toContain(t('caregiver:reminders.create'));
  });

  it('disables «Marcar como realizado» while it is being saved', () => {
    mocks.reminders = {
      status: 'ready',
      reminders: [TODAY],
      error: null,
      completingIds: [TODAY.id],
    };

    const html = render(RemindersScreen);

    expect(html).toContain(t('caregiver:reminders.marking'));
  });

  it('shows the back header, subtitle and places notification status below the list', () => {
    const tree = renderTree(RemindersScreen as () => unknown);
    const html = render(RemindersScreen);

    expect(findElementByTestId(tree, 'reminders-header')).not.toBeNull();
    expect(html).toContain('reminders-header-back');
    expect(html).toContain(t('caregiver:reminders.subtitle'));
    expect(html.indexOf(String(t('caregiver:reminders.upcomingTitle')))).toBeLessThan(
      html.indexOf(String(t('caregiver:reminders.notifications.enabled'))),
    );
  });

  it('never shows sample data', () => {
    mocks.reminders = { status: 'ready', reminders: [], error: null, completingIds: [] };

    const html = render(RemindersScreen);

    expect(html).not.toContain('Centro de Salud La Esperanza');
    expect(html).not.toContain('Mateo José Rodríguez');
  });
});

describe('AddReminderScreen («Crear un recordatorio»)', () => {
  it('renders PillField containers for date and time inputs', () => {
    const tree = renderTree(AddReminderScreen as () => unknown);
    const html = render(AddReminderScreen);

    expect(findElementByTestId(tree, 'add-reminder-header')).not.toBeNull();
    expect(html).toContain('add-reminder-header-back');
    expect(findElementByTestId(tree, 'add-reminder-date-field')).not.toBeNull();
    expect(findElementByTestId(tree, 'add-reminder-time-field')).not.toBeNull();
  });

  it('shows the form with the child chips and both reminder types', () => {
    const html = render(AddReminderScreen);

    expect(html).toContain(t('caregiver:addReminder.title'));
    expect(html).toContain('Mateo');
    expect(html).toContain('Valentina');
    expect(html).toContain(t('caregiver:reminders.types.checkup'));
    expect(html).toContain(t('caregiver:reminders.types.activity'));
    expect(html).not.toContain(t('caregiver:reminders.types.next_checkup'));
    expect(html).toContain(t('caregiver:addReminder.submit'));
  });

  it('does not ask for the child when there is only one', () => {
    mocks.children = { status: 'ready', children: [MATEO], error: null };

    const html = render(AddReminderScreen);

    expect(html).not.toContain(t('caregiver:addReminder.childLabel'));
  });

  it('shows a loading state while the children load', () => {
    mocks.children = { status: 'loading', children: [], error: null };

    const html = render(AddReminderScreen);

    expect(html).toContain(t('caregiver:addReminder.loading'));
    expect(html).not.toContain(t('caregiver:addReminder.submit'));
  });

  it('shows the error with a retry that reloads the children', () => {
    mocks.children = { status: 'error', children: [], error: 'Sin conexión' };

    const tree = renderTree(AddReminderScreen as () => unknown);
    expect(render(AddReminderScreen)).toContain('Sin conexión');

    press(tree, 'add-reminder-retry');
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a way to register a child', () => {
    mocks.children = { status: 'empty', children: [], error: null };

    expect(render(AddReminderScreen)).toContain(t('caregiver:addReminder.emptyTitle'));

    press(renderTree(AddReminderScreen as () => unknown), 'add-reminder-add-child');
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.CONSENT,
      params: { mode: 'register' },
    });
  });

  it('saves the reminder with the default date and goes back to the list', async () => {
    mocks.params = { childId: VALENTINA.id };
    mocks.create.mockResolvedValueOnce(NEXT);

    press(renderTree(AddReminderScreen as () => unknown), 'submit-reminder-button');
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalled());

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ childId: VALENTINA.id, type: 'checkup' }),
    );
    expect(mocks.replace).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.REMINDERS,
      params: { childId: VALENTINA.id },
    });
  });
});
