import type { CaregiverCheckupResponse, ChildResponse } from '@nutrikids/shared';
import React from 'react';
import type * as ReactTypes from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';

const hookStore = vi.hoisted(() => ({
  enabled: false,
  states: [] as unknown[],
  cursor: 0,
  reset() {
    this.enabled = false;
    this.states = [];
    this.cursor = 0;
  },
  rewind() {
    this.cursor = 0;
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      if (!hookStore.enabled) {
        return actual.useState(initial);
      }
      const idx = hookStore.cursor++;
      if (!(idx in hookStore.states)) {
        hookStore.states[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (updater: T | ((prev: T) => T)) => {
        const prev = hookStore.states[idx] as T;
        hookStore.states[idx] =
          typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
      };
      return [hookStore.states[idx] as T, setState] as const;
    },
  };
});

function renderTree(Component: () => unknown): { tree: React.ReactNode; html: string } {
  hookStore.rewind();
  let tree: React.ReactNode = null;
  function Capture() {
    tree = Component() as React.ReactNode;
    return tree as React.ReactElement;
  }
  const html = renderToString(React.createElement(Capture));
  return { tree, html };
}

function findElementByTestId(
  node: unknown,
  testID: string,
): React.ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findElementByTestId(item, testID);
      if (found) return found;
    }
    return null;
  }
  if (React.isValidElement<Record<string, unknown>>(node)) {
    if (node.props?.['testID'] === testID) return node;
    return findElementByTestId(node.props?.['children'], testID);
  }
  return null;
}

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerBack: vi.fn(),
  routerReplace: vi.fn(),
  searchParams: { childId: 'child-1' } as Record<string, string>,
  checkupsHook: {
    status: 'ready',
    checkups: [] as CaregiverCheckupResponse[],
    error: null as string | null,
    load: vi.fn(async () => []),
  },
  childrenHook: {
    children: [] as ChildResponse[],
    loading: false,
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    back: mocks.routerBack,
    replace: mocks.routerReplace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mocks.searchParams,
  useFocusEffect: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('../context/auth-context.js', () => ({
  useOptionalAuth: () => ({
    user: {
      id: 'caregiver-1',
      activeRole: 'CAREGIVER',
    },
  }),
}));

vi.mock('../hooks/useActiveChild.js', () => ({
  useActiveChildId: () => 'child-1',
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => mocks.childrenHook,
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: () => mocks.checkupsHook,
  useProfessionalCheckups: () => mocks.checkupsHook,
}));

import CheckupHistoryScreen from '../app/(caregiver)/checkup-history.js';

const mockChild: ChildResponse = {
  id: 'child-1',
  firstName: 'Samuel',
  lastName: 'Guzmán',
  birthDate: '2024-03-10',
  sex: 'MALE',
};

const mockCheckup1: CaregiverCheckupResponse = {
  id: 'chk-1',
  childId: 'child-1',
  measuredAt: '2026-11-15T10:00:00.000Z',
  weightKg: 12.5,
  lengthHeightCm: 88.0,
  position: 'STANDING',
  origin: 'PROFESSIONAL',
  recordedById: 'pro-1',
  recordedBy: {
    userId: 'pro-1',
    firstName: 'Carlos',
    lastName: 'Méndez',
    role: 'PROFESSIONAL',
    specialty: 'pediatrics',
  },
  correctedCheckupId: null,
  isCurrent: true,
  notes: 'Control periódico normal.',
  createdAt: '2026-11-15T10:00:00.000Z',
};

describe('CheckupHistoryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookStore.reset();
    mocks.searchParams = { childId: 'child-1' };
    mocks.childrenHook = {
      children: [mockChild],
      loading: false,
    };
    mocks.checkupsHook = {
      status: 'ready',
      checkups: [mockCheckup1],
      error: null,
      load: vi.fn(async () => [mockCheckup1] as unknown as never[]),
    };
  });

  it('renders checkup history screen with banner, filters, measurements, tags, and recorder', () => {
    const html = renderToString(React.createElement(CheckupHistoryScreen));

    expect(html).toContain('checkup-history-screen');
    expect(html).toContain('Historial de controles');
    expect(html).toContain('1 control registrado');
    expect(html).toContain('Samuel Guzmán');
    expect(html).toContain('checkup-history-filters');
    expect(html).toContain('12.5 kg · 88.0 cm');
    expect(html).toContain('Profesional');
    expect(html).toContain('De pie');
    expect(html).toContain('Carlos Méndez');
    expect(html).toContain('Control periódico normal.');
    expect(html).toContain('checkup-history-register-footer');
  });

  it('renders loading state when status is loading', () => {
    mocks.checkupsHook.status = 'loading';
    mocks.checkupsHook.checkups = [];

    const html = renderToString(React.createElement(CheckupHistoryScreen));
    expect(html).toContain('checkup-history-loading');
    expect(html).toContain('Cargando el historial...');
  });

  it('renders error state when fetch fails', () => {
    mocks.checkupsHook.status = 'error';
    mocks.checkupsHook.error = 'Error al consultar controles';
    mocks.checkupsHook.checkups = [];

    const html = renderToString(React.createElement(CheckupHistoryScreen));
    expect(html).toContain('checkup-history-error');
    expect(html).toContain('Error al consultar controles');
    expect(html).toContain('checkup-history-retry');
  });

  it('renders empty state when there are no checkups recorded', () => {
    mocks.checkupsHook.status = 'empty';
    mocks.checkupsHook.checkups = [];

    const html = renderToString(React.createElement(CheckupHistoryScreen));
    expect(html).toContain('checkup-history-empty');
    expect(html).toContain('Aún no hay controles');
    expect(html).toContain('checkup-history-register-empty');
  });

  it('navigates to add checkup route when register button is pressed', () => {
    expect(APP_ROUTES.CAREGIVER.CHECKUP_HISTORY).toBe('/(caregiver)/checkup-history');
    expect(APP_ROUTES.PROFESSIONAL.CHECKUP_HISTORY).toBe('/(professional)/checkup-history');
    expect(APP_ROUTES.CAREGIVER.ADD_CHECKUP).toBe('/(caregiver)/add-checkup');
  });

  it('filters checkups by origin tab, shows CheckupMenuButton, and handles empty filter state', () => {
    hookStore.enabled = true;
    const caregiverCheckup: CaregiverCheckupResponse = {
      ...mockCheckup1,
      id: 'chk-2',
      weightKg: 13.4,
      lengthHeightCm: 90.0,
      origin: 'CAREGIVER',
      recordedById: 'caregiver-1',
      recordedBy: null,
      notes: 'Control registrado en casa.',
    };
    mocks.checkupsHook.checkups = [mockCheckup1, caregiverCheckup];

    const { tree: initialTree, html: initialHtml } = renderTree(() =>
      CheckupHistoryScreen({ roleMode: 'CAREGIVER' }),
    );
    expect(initialHtml).toContain('checkup-history-menu-chk-1');
    expect(initialHtml).toContain('checkup-history-menu-chk-2');

    const proTab = findElementByTestId(initialTree, 'checkup-filter-PROFESSIONAL');
    expect(proTab).not.toBeNull();
    (proTab?.props?.['onPress'] as () => void)();

    const { tree: proTree, html: proHtml } = renderTree(() =>
      CheckupHistoryScreen({ roleMode: 'CAREGIVER' }),
    );
    expect(proHtml).toContain('12.5 kg · 88.0 cm');
    expect(proHtml).not.toContain('13.4 kg · 90.0 cm');

    // Switch to CAREGIVER tab with only PROFESSIONAL checkup to verify empty filter state
    mocks.checkupsHook.checkups = [mockCheckup1];
    const cgTab = findElementByTestId(proTree, 'checkup-filter-CAREGIVER');
    expect(cgTab).not.toBeNull();
    (cgTab?.props?.['onPress'] as () => void)();

    const { html: emptyFilterHtml } = renderTree(() =>
      CheckupHistoryScreen({ roleMode: 'PROFESSIONAL' }),
    );
    expect(emptyFilterHtml).toContain('checkup-history-empty-filter');
  });
});
