import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaregiverCheckupResponse, ChildResponse } from '@nutrikids/shared';

const mocks = vi.hoisted(() => ({
  useChildren: vi.fn(),
  useCheckups: vi.fn(),
}));

vi.mock('react-native', () => {
  const host = (tag: string) => {
    const Comp = ({
      children,
      testID,
      maxLength,
      placeholder,
      value,
    }: {
      children?: React.ReactNode;
      testID?: string;
      maxLength?: number;
      placeholder?: string;
      value?: string;
      [key: string]: unknown;
    }) =>
      React.createElement(
        tag,
        {
          ...(testID ? { 'data-testid': testID } : {}),
          ...(maxLength !== undefined ? { maxLength } : {}),
          ...(placeholder ? { placeholder } : {}),
          ...(value !== undefined ? { value, readOnly: true } : {}),
        },
        children,
      );
    Comp.displayName = tag;
    return Comp;
  };
  return {
    View: host('div'),
    Text: host('span'),
    Pressable: host('button'),
    ScrollView: host('div'),
    TextInput: host('input'),
    KeyboardAvoidingView: host('div'),
    ActivityIndicator: host('div'),
    Modal: host('div'),
    Keyboard: {
      addListener: () => ({ remove: vi.fn() }),
      dismiss: vi.fn(),
      metrics: () => null,
    },
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
    StyleSheet: {
      create: <T,>(s: T): T => s,
      flatten: (s: unknown) => s,
      hairlineWidth: 1,
    },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock('react-native-svg', () => {
  const svgHost = (tag: string) => {
    const Comp = ({ children }: { children?: React.ReactNode }) =>
      React.createElement(tag, null, children);
    return Comp;
  };
  return {
    __esModule: true,
    default: svgHost('svg'),
    Svg: svgHost('svg'),
    Path: svgHost('path'),
    Circle: svgHost('circle'),
    Line: svgHost('line'),
    G: svgHost('g'),
    Rect: svgHost('rect'),
    Text: svgHost('text'),
    TSpan: svgHost('tspan'),
  };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: vi.fn(),
  useNavigation: () => ({ setParams: vi.fn() }),
  Stack: { Screen: () => null },
}));

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'es' }],
}));

vi.mock('expo-crypto', () => ({
  randomUUID: () => '44444444-4444-4444-8444-444444444444',
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: {} },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => React.createElement('span', null, name),
}));

vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', null, name),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: mocks.useChildren,
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: mocks.useCheckups,
}));

vi.mock('../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: '33333333-3333-4333-8333-333333333333', role: 'CAREGIVER', name: 'Ana' },
    signOut: vi.fn(),
  }),
}));

import '../i18n/index.js';
import AddCheckupScreen from '../app/(caregiver)/add-checkup.js';
import EvolutionScreen from '../app/(caregiver)/evolution.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';

const child: ChildResponse = {
  id: CHILD_ID,
  firstName: 'Lucia',
  lastName: 'Perez',
  birthDate: '2024-01-10T00:00:00.000Z',
  sex: 'FEMALE',
};

const baseCheckup: CaregiverCheckupResponse = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: CHILD_ID,
  measuredAt: '2026-11-10T15:00:00.000Z',
  weightKg: 13.4,
  lengthHeightCm: 91.5,
  position: 'STANDING',
  origin: 'CAREGIVER',
  recordedById: '33333333-3333-4333-8333-333333333333',
  recordedBy: null,
  correctedCheckupId: null,
  isCurrent: true,
  notes: null,
  createdAt: '2026-11-10T15:00:01.000Z',
};

describe('checkup notes in caregiver screens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useChildren.mockReturnValue({
      status: 'ready',
      children: [child],
      error: null,
      load: vi.fn(),
      create: vi.fn(),
    });
  });

  it('renders observations field with 0/500 counter in AddCheckupScreen', () => {
    mocks.useCheckups.mockReturnValue({
      status: 'idle',
      checkups: [],
      error: null,
      load: vi.fn(),
      create: vi.fn(),
    });

    const out = renderToStaticMarkup(React.createElement(AddCheckupScreen));
    expect(out).toContain('Notas');
    expect(out).toContain('Ejemplo: qué comió hoy...');
    expect(out).toContain('0/500');
    expect(out).toContain('maxLength="500"');
  });

  it('shows latest checkup notes in EvolutionScreen when present and omits when null', () => {
    mocks.useCheckups.mockReturnValue({
      status: 'ready',
      checkups: [{ ...baseCheckup, notes: 'Comio bien durante la semana' }],
      error: null,
      load: vi.fn(),
      create: vi.fn(),
    });

    const withNotes = renderToStaticMarkup(React.createElement(EvolutionScreen));
    expect(withNotes).toContain('Comio bien durante la semana');

    mocks.useCheckups.mockReturnValue({
      status: 'ready',
      checkups: [baseCheckup],
      error: null,
      load: vi.fn(),
      create: vi.fn(),
    });

    const withoutNotes = renderToStaticMarkup(React.createElement(EvolutionScreen));
    expect(withoutNotes).not.toContain('Comio bien durante la semana');
    expect(withoutNotes).not.toContain('Observaciones');
  });
});
