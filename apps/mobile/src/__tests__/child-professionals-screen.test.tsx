import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: true,
  childId: 'child-123',
  listLinkedProfessionals: vi.fn(async (_childId: string) => [
    {
      id: 'assign-1',
      childId: 'child-123',
      professionalId: 'prof-456',
      firstName: 'Si',
      lastName: 'Si',
      specialty: 'nursing',
      startDate: '2026-01-01T00:00:00Z',
      endDate: null,
    },
  ]),
  unlinkProfessional: vi.fn(async (_childId: string, _professionalId: string) => ({
    success: true,
  })),
  childrenHookState: {
    status: 'ready',
    children: [
      {
        id: 'child-123',
        firstName: 'Samuel',
        lastName: 'Guzman',
        birthDate: '2025-03-01',
        sex: 'MALE',
      },
    ],
    error: null,
    load: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-ionicons', props),
}));

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
    Modal: ({
      visible,
      children,
      ...rest
    }: {
      visible?: boolean;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => (visible ? React.createElement('mock-modal', rest, children) : null),
  };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
    canGoBack: () => mocks.canGoBack,
  }),
  useLocalSearchParams: () => ({ childId: mocks.childId }),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => mocks.childrenHookState,
}));

vi.mock('../lib/professionals-api.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listLinkedProfessionals: (childId: string) => mocks.listLinkedProfessionals(childId),
    unlinkProfessional: (childId: string, professionalId: string) =>
      mocks.unlinkProfessional(childId, professionalId),
    filterActiveProfessionals: (list: unknown[]) => list,
  };
});

import ChildProfessionalsScreen from '../app/(caregiver)/child-professionals.js';

interface ElementWithProps {
  props?: {
    testID?: string;
    children?: unknown;
    onPress?: () => void;
    onBack?: () => void;
    [key: string]: unknown;
  };
}

function findElementByTestId(node: unknown, testID: string): ElementWithProps | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const match = findElementByTestId(item, testID);
      if (match) return match;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as ElementWithProps;
  if (obj.props?.testID === testID) return obj;
  if (obj.props) {
    for (const key of Object.keys(obj.props)) {
      const match = findElementByTestId(obj.props[key], testID);
      if (match) return match;
    }
  }
  return null;
}

describe('ChildProfessionalsScreen with unified ConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders linked professional card with integrated unlink button', () => {
    let tree: unknown = null;
    function Capture() {
      tree = ChildProfessionalsScreen({
        initialProfessionals: [
          {
            id: 'assign-1',
            childId: 'child-123',
            professionalId: 'prof-456',
            firstName: 'Si',
            lastName: 'Si',
            specialty: 'nursing',
            startDate: '2026-01-01T00:00:00Z',
            endDate: null,
          },
        ],
      });
      return tree as React.ReactElement;
    }
    const html = renderToString(React.createElement(Capture));

    expect(html).toContain('Profesionales');
    expect(html).toContain('Samuel Guzman');
    expect(html).toContain('Si Si');
    expect(html).toContain('Desvincular');

    const card = findElementByTestId(tree, 'child-professional-prof-456');
    expect(card).not.toBeNull();
    expect(card?.props?.footer).toBeDefined();
  });

  it('navigates to link professional screen when "Vincular otro profesional" is pressed', () => {
    let tree: unknown = null;
    function Capture() {
      tree = ChildProfessionalsScreen({
        initialProfessionals: [],
      });
      return tree as React.ReactElement;
    }
    renderToString(React.createElement(Capture));

    const linkBtn = findElementByTestId(tree, 'child-professionals-link');
    expect(linkBtn).not.toBeNull();
    linkBtn?.props?.onPress?.();

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/(caregiver)/link-professional',
      params: { childId: 'child-123' },
    });
  });

  it('navigates back when header onBack is called', () => {
    let tree: unknown = null;
    function Capture() {
      tree = ChildProfessionalsScreen({
        initialProfessionals: [],
      });
      return tree as React.ReactElement;
    }
    renderToString(React.createElement(Capture));

    const header = findElementByTestId(tree, 'child-professionals-header');
    expect(header).not.toBeNull();
    header?.props?.onBack?.();

    expect(mocks.back).toHaveBeenCalled();
  });
});
