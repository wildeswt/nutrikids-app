import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';
import type { ChildrenHookState } from '../hooks/useChildren.js';
import type * as HomeSummaryModule from '../hooks/useHomeSummary.js';
import type { HomeSummaryState } from '../hooks/useHomeSummary.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: true,
  loadEducation: vi.fn(),
  reloadNotifications: vi.fn(),
  loadHomeSummary: vi.fn(),
  notificationsUnreadCount: 0,
  education: {
    status: 'ready',
    articles: [] as unknown[],
    contentLanguage: 'es',
    offline: false,
    error: null as string | null,
  },
  homeSummary: {
    messageStatus: 'ready',
    latestMessage: {
      conversation: {
        childId: '11111111-1111-4111-8111-111111111111',
        participant: {
          userId: '22222222-2222-4222-8222-222222222222',
          firstName: 'Dra. Carolina',
          lastName: 'Díaz',
          role: 'PROFESSIONAL',
          specialty: 'pediatrics',
        },
        lastMessage: {
          id: '33333333-3333-4333-8333-333333333333',
          childId: '11111111-1111-4111-8111-111111111111',
          senderId: '22222222-2222-4222-8222-222222222222',
          recipientId: 'u0000000-0000-0000-0000-000000000001',
          kind: 'message',
          body: 'Sigamos ofreciendo agua durante el día',
          sentAt: '2026-11-12T10:00:00.000Z',
          readAt: null,
        },
        unreadCount: 1,
      },
      senderName: 'Dra. Carolina Díaz',
      body: 'Sigamos ofreciendo agua durante el día',
      sentAt: '2026-11-12T10:00:00.000Z',
    },
    messageError: null,
    reminderStatus: 'ready',
    nextReminder: {
      id: '44444444-4444-4444-8444-444444444444',
      childId: '11111111-1111-4111-8111-111111111111',
      type: 'checkup',
      scheduledFor: '2026-11-24T09:30:00.000Z',
      status: 'pending',
    },
    reminderError: null,
  } as HomeSummaryState,
  childrenHookState: {
    status: 'ready',
    children: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        firstName: 'Mateo',
        lastName: 'Gómez',
        birthDate: '2023-06-15',
        sex: 'MALE',
      },
    ],
    error: null,
    load: vi.fn(),
    create: vi.fn(),
  } as ChildrenHookState & { load: () => Promise<void>; create: Mock },
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
    canGoBack: () => mocks.canGoBack,
  }),
  useFocusEffect: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../constants/assets.js', () => ({
  APP_ASSETS: {
    LOGO: { uri: 'mock-logo.png' },
  },
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: {
      id: 'u0000000-0000-0000-0000-000000000001',
      firstName: 'Andrea',
      lastName: 'Silva',
      email: 'andrea@example.com',
      roles: ['CAREGIVER'],
    },
    activeRole: 'CAREGIVER',
    switchRole: vi.fn(),
    signOut: vi.fn(),
    status: 'authenticated',
  }),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => mocks.childrenHookState,
}));

vi.mock('../hooks/useEducation.js', () => ({
  useEducation: () => ({ ...mocks.education, load: mocks.loadEducation }),
}));

vi.mock('../hooks/useNotifications.js', () => ({
  useNotifications: () => ({
    notifications: [],
    loading: false,
    refreshing: false,
    error: null,
    unreadCount: mocks.notificationsUnreadCount,
    reload: mocks.reloadNotifications,
    refresh: vi.fn(),
    markAsRead: vi.fn(),
  }),
}));

vi.mock('../hooks/useHomeSummary.js', async (importOriginal) => {
  const actual = await importOriginal<typeof HomeSummaryModule>();
  return {
    ...actual,
    useHomeSummary: () => ({ ...mocks.homeSummary, load: mocks.loadHomeSummary }),
  };
});

import AddChildScreen from '../app/(caregiver)/add-child.js';
import CaregiverHomeScreen from '../app/(caregiver)/index.js';
import MyChildrenScreen from '../app/(caregiver)/my-children.js';
import { setActiveChildId } from '../hooks/useActiveChild.js';
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

const MATEO = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

const VALENTINA = {
  id: '55555555-5555-4555-8555-555555555555',
  firstName: 'Valentina',
  lastName: 'Ríos',
  birthDate: '2024-02-10',
  sex: 'FEMALE' as const,
};

describe('Caregiver Screens (NK-21 / NK-66)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveChildId(null);
    mocks.canGoBack = true;
    mocks.notificationsUnreadCount = 0;
    mocks.education = { ...mocks.education, status: 'ready', articles: [] };
    mocks.childrenHookState = {
      ...mocks.childrenHookState,
      status: 'ready',
      children: [MATEO],
    };
    mocks.homeSummary = {
      ...mocks.homeSummary,
      messageStatus: 'ready',
      reminderStatus: 'ready',
      messageError: null,
      reminderError: null,
    };
  });

  describe('CaregiverHomeScreen (Inicio - NK-66)', () => {
    it('navigates to notifications when bell button is pressed and shows dot only when unread', () => {
      let capturedTree: unknown = null;
      function Capture() {
        capturedTree = CaregiverHomeScreen();
        return null;
      }

      mocks.notificationsUnreadCount = 0;
      renderToString(React.createElement(Capture));
      expect(findElementByTestId(capturedTree, 'home-bell-dot')).toBeNull();

      mocks.notificationsUnreadCount = 3;
      renderToString(React.createElement(Capture));
      expect(findElementByTestId(capturedTree, 'home-bell-dot')).not.toBeNull();

      const bellButton = findElementByTestId(capturedTree, 'caregiver-notifications-bell');
      expect(bellButton).toBeDefined();
      (bellButton?.props?.['onPress'] as (() => void) | undefined)?.();
      expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.NOTIFICATIONS);
    });

    it('renders personalized greeting with caregiver name', () => {
      const html = renderToString(React.createElement(CaregiverHomeScreen));
      expect(html).toContain('¡Hola, Andrea!');
    });

    it('renders only the active child card without dashed add card or bottom registration section', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
        status: 'ready',
        children: [MATEO, VALENTINA],
      };

      let capturedTree: unknown = null;
      function Capture() {
        capturedTree = CaregiverHomeScreen();
        return capturedTree as React.ReactElement;
      }
      const html = renderToString(React.createElement(Capture));

      // Active child is rendered; second child is NOT listed on Home
      expect(html).toContain('Mateo');
      expect(html).not.toContain('Valentina');
      expect(html).toContain(i18n.t('caregiver:home.statusOk'));

      // Dashed card and duplicate bottom registration section are gone from Home
      expect(findElementByTestId(capturedTree, 'add-child-dashed-card')).toBeNull();
      expect(findElementByTestId(capturedTree, 'start-child-registration-button')).toBeNull();
      expect(html).not.toContain(i18n.t('caregiver:home.linkedNotice'));

      // Link to «Mis niños» appears when multiple children exist
      const myChildrenLink = findElementByTestId(capturedTree, 'home-my-children-link');
      expect(myChildrenLink).not.toBeNull();
      (myChildrenLink?.props?.['onPress'] as (() => void) | undefined)?.();
      expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.MY_CHILDREN);

      // No technical WHO z-scores shown to caregiver
      expect(html).not.toContain('zPE');
      expect(html).not.toContain('zTE');
      expect(html).not.toContain('zPT');
      expect(html).not.toContain('zScore');
      expect(html).not.toContain('z-score');
    });

    it('navigates to Evolution when tapping the active child card and to Feeding via its own row', () => {
      let capturedTree: unknown = null;
      function Capture() {
        capturedTree = CaregiverHomeScreen();
        return capturedTree as React.ReactElement;
      }
      renderToString(React.createElement(Capture));

      const childCard = findElementByTestId(capturedTree, `child-card-${MATEO.id}`);
      expect(childCard).not.toBeNull();
      (childCard?.props?.['onPress'] as (() => void) | undefined)?.();
      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.CAREGIVER.EVOLUTION,
        params: { childId: MATEO.id },
      });

      const feedingButton = findElementByTestId(capturedTree, 'child-feeding-button');
      expect(feedingButton).not.toBeNull();
      (feedingButton?.props?.['onPress'] as (() => void) | undefined)?.();
      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.CAREGIVER.FEEDING,
        params: { childId: MATEO.id },
      });
    });

    it('renders empty state when caregiver has no registered children', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
        status: 'empty',
        children: [],
      };

      const html = renderToString(React.createElement(CaregiverHomeScreen));

      expect(html).toContain(i18n.t('caregiver:home.emptyTitle'));
      expect(html).toContain(i18n.t('caregiver:home.addChild'));
    });

    it('renders real «Para ti» and «Próximo control» cards and their empty states', () => {
      const readyHtml = renderToString(React.createElement(CaregiverHomeScreen));
      expect(readyHtml).toContain('Sigamos ofreciendo agua durante el día');
      expect(readyHtml).toContain('Dra. Carolina Díaz');
      expect(readyHtml).toContain(i18n.t('caregiver:reminders.types.checkup'));
      expect(readyHtml).toContain(i18n.t('caregiver:home.checkupDetails'));

      mocks.homeSummary = {
        ...mocks.homeSummary,
        messageStatus: 'empty',
        latestMessage: null,
        reminderStatus: 'empty',
        nextReminder: null,
      };
      const emptyHtml = renderToString(React.createElement(CaregiverHomeScreen));
      expect(emptyHtml).toContain(i18n.t('caregiver:home.messageEmpty'));
      expect(emptyHtml).toContain(i18n.t('caregiver:home.checkupEmpty'));
    });

    describe('«Aprende en casa» cards', () => {
      const monthsAgo = (months: number) => {
        const date = new Date();
        date.setMonth(date.getMonth() - months, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
      };
      const article = (n: number, title: string, minAgeMonths: number, maxAgeMonths: number) => ({
        id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        title,
        body: 'Texto del artículo.',
        minAgeMonths,
        maxAgeMonths,
        language: 'es',
      });

      beforeEach(() => {
        mocks.childrenHookState = {
          ...mocks.childrenHookState,
          status: 'ready',
          children: [{ ...MATEO, birthDate: monthsAgo(40) }],
        };
      });

      it('shows the real articles for the age of the active child, not sample ones', () => {
        mocks.education = {
          ...mocks.education,
          status: 'ready',
          articles: [
            article(1, 'Para bebés grandes', 12, 23),
            article(2, 'Meriendas para llevar', 36, 47),
          ],
        };

        const html = renderToString(React.createElement(CaregiverHomeScreen));

        expect(html).toContain('Meriendas para llevar');
        expect(html).not.toContain('Para bebés grandes');
        expect(html).not.toContain('Ideas de');
        expect(html).not.toContain('a los 3 años');
      });

      it('shows the first articles of the catalog when none matches the age', () => {
        mocks.education = {
          ...mocks.education,
          status: 'ready',
          articles: [article(1, 'Para bebés grandes', 12, 23)],
        };

        expect(renderToString(React.createElement(CaregiverHomeScreen))).toContain(
          'Para bebés grandes',
        );
      });

      it('asks to connect once when the catalog was never downloaded', () => {
        mocks.education = { ...mocks.education, status: 'needs-connection', articles: [] };

        expect(renderToString(React.createElement(CaregiverHomeScreen))).toContain(
          i18n.t('caregiver:home.learnConnect'),
        );
      });

      it('«Ver todo» opens the list of articles', () => {
        const meriendas = article(2, 'Meriendas para llevar', 36, 47);
        mocks.education = { ...mocks.education, status: 'ready', articles: [meriendas] };
        let capturedTree: unknown = null;
        function Capture() {
          capturedTree = CaregiverHomeScreen();
          return null;
        }
        renderToString(React.createElement(Capture));

        const seeAll = findElementByTestId(capturedTree, 'home-learn-see-all');
        (seeAll?.props?.['onPress'] as (() => void) | undefined)?.();

        expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.LEARN);
      });
    });
  });

  describe('MyChildrenScreen («Mis niños» - NK-66)', () => {
    it('renders all linked children, dashed add card to ADD_CHILD, and privacy notice', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
        status: 'ready',
        children: [MATEO, VALENTINA],
      };

      let capturedTree: unknown = null;
      function Capture() {
        capturedTree = MyChildrenScreen();
        return capturedTree as React.ReactElement;
      }
      const html = renderToString(React.createElement(Capture));

      expect(html).toContain('Mis niños');
      expect(html).toContain('Mateo');
      expect(html).toContain('Valentina');
      expect(html).toContain(i18n.t('caregiver:home.linkedNotice'));

      const dashedCard = findElementByTestId(capturedTree, 'add-child-dashed-card');
      expect(dashedCard).not.toBeNull();
      (dashedCard?.props?.['onPress'] as (() => void) | undefined)?.();
      expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.ADD_CHILD);
    });

    it('sets the selected child as active and returns to Home when tapped', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
        status: 'ready',
        children: [MATEO, VALENTINA],
      };

      let capturedTree: unknown = null;
      function Capture() {
        capturedTree = MyChildrenScreen();
        return null;
      }
      renderToString(React.createElement(Capture));

      const valentinaCard = findElementByTestId(capturedTree, `my-children-card-${VALENTINA.id}`);
      expect(valentinaCard).not.toBeNull();
      (valentinaCard?.props?.['onPress'] as (() => void) | undefined)?.();

      expect(mocks.back).toHaveBeenCalled();

      // Home now shows Valentina as the active child
      const homeHtml = renderToString(React.createElement(CaregiverHomeScreen));
      expect(homeHtml).toContain('Valentina');
      expect(homeHtml).not.toContain('Mateo');
    });
  });

  describe('AddChildScreen («Registrar niño»)', () => {
    it('renders child registration form fields and legal representative check', () => {
      const html = renderToString(React.createElement(AddChildScreen));

      expect(html).toContain(i18n.t('caregiver:addChild.title'));
      expect(html).toContain(i18n.t('caregiver:addChild.firstNameLabel'));
      expect(html).toContain(i18n.t('caregiver:addChild.lastNameLabel'));
      expect(html).toContain(i18n.t('caregiver:addChild.birthDateLabel'));
      expect(html).toContain(i18n.t('caregiver:addChild.sexLabel'));
      expect(html).toContain(i18n.t('caregiver:addChild.sexMale'));
      expect(html).toContain(i18n.t('caregiver:addChild.sexFemale'));
      expect(html).toContain(i18n.t('caregiver:addChild.relationshipLabel'));
      expect(html).toContain(i18n.t('common:relationships.LEGAL_GUARDIAN'));
      expect(html).toContain('representante legal');
      expect(html).toContain(i18n.t('caregiver:addChild.submit'));
    });
  });
});
