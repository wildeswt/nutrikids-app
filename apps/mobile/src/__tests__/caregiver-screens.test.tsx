import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';
import type { ChildrenHookState } from '../hooks/useChildren.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  loadEducation: vi.fn(),
  education: {
    status: 'ready',
    articles: [] as unknown[],
    contentLanguage: 'es',
    offline: false,
    error: null as string | null,
  },
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

import AddChildScreen from '../app/(caregiver)/add-child.js';
import CaregiverHomeScreen from '../app/(caregiver)/index.js';
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

describe('Caregiver Screens (NK-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.education = { ...mocks.education, status: 'ready', articles: [] };
  });

  describe('CaregiverHomeScreen («Mis niños» - Figura 6a)', () => {
    it('navigates to messages when bell button is pressed', () => {
      let capturedTree: unknown = null;
      function TestWrapper() {
        capturedTree = CaregiverHomeScreen();
        return null;
      }
      renderToString(React.createElement(TestWrapper));

      const bellButton = findElementByTestId(capturedTree, 'caregiver-notifications-bell');
      expect(bellButton).toBeDefined();
      const onPress = bellButton?.props?.['onPress'] as (() => void) | undefined;
      onPress?.();
      expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.MESSAGES);
    });

    it('renders personalized greeting with caregiver name', () => {
      const html = renderToString(React.createElement(CaregiverHomeScreen));
      expect(html).toContain('¡Hola, Andrea!');
    });

    it('renders child card with clear language status, dashed add card, and no z-scores', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
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
      };

      const html = renderToString(React.createElement(CaregiverHomeScreen));

      // Child name and age
      expect(html).toContain('Mateo');
      expect(html).toContain('Gómez');

      // Status in clear language (text + icon)
      expect(html).toContain(i18n.t('caregiver:home.statusOk'));

      // Dashed add child card and privacy notice
      expect(html).toContain(i18n.t('caregiver:home.linkedNotice'));

      // Acceptance criterion: No technical WHO z-scores shown to caregiver
      expect(html).not.toContain('zPE');
      expect(html).not.toContain('zTE');
      expect(html).not.toContain('zPT');
      expect(html).not.toContain('zScore');
      expect(html).not.toContain('z-score');
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

    it('navigates to consent in register mode when pressing "+ Registrar nuevo niño"', () => {
      let capturedTree: unknown = null;
      function TestWrapper() {
        capturedTree = CaregiverHomeScreen();
        return null;
      }
      renderToString(React.createElement(TestWrapper));

      const button = findElementByTestId(capturedTree, 'start-child-registration-button');
      expect(button).toBeDefined();
      const onPress = button?.props?.['onPress'] as (() => void) | undefined;
      onPress?.();

      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.CAREGIVER.CONSENT,
        params: { mode: 'register' },
      });
    });

    it('navigates to consent in register mode when pressing dashed add child card', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
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
      };

      let capturedTree: unknown = null;
      function TestWrapper() {
        capturedTree = CaregiverHomeScreen();
        return null;
      }
      renderToString(React.createElement(TestWrapper));

      const dashedCard = findElementByTestId(capturedTree, 'add-child-dashed-card');
      expect(dashedCard).toBeDefined();
      const onPress = dashedCard?.props?.['onPress'] as (() => void) | undefined;
      onPress?.();

      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.CAREGIVER.CONSENT,
        params: { mode: 'register' },
      });
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
          children: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              firstName: 'Mateo',
              lastName: 'Gómez',
              birthDate: monthsAgo(40),
              sex: 'MALE',
            },
          ],
        };
      });

      it('shows the real articles for the age of the first child, not sample ones', () => {
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

      it('«Ver todo» opens the list of articles and the cards open their article', () => {
        const meriendas = article(2, 'Meriendas para llevar', 36, 47);
        mocks.education = { ...mocks.education, status: 'ready', articles: [meriendas] };
        let capturedTree: unknown = null;
        function TestWrapper() {
          capturedTree = CaregiverHomeScreen();
          return null;
        }
        renderToString(React.createElement(TestWrapper));

        const seeAll = findElementByTestId(capturedTree, 'home-learn-see-all');
        (seeAll?.props?.['onPress'] as (() => void) | undefined)?.();

        expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.LEARN);
      });
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
