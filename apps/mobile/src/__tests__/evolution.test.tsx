import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaregiverCheckupResponse, GrowthTrendResponse } from '@nutrikids/shared';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  growthTrends: null as GrowthTrendResponse | null,
  children: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      firstName: 'Mateo',
      lastName: 'Gómez',
      birthDate: '2023-06-15',
      sex: 'MALE' as const,
    },
  ],
  checkups: [
    {
      id: 'c1111111-1111-4111-8111-111111111111',
      childId: '11111111-1111-4111-8111-111111111111',
      measuredAt: '2026-11-01T10:00:00.000Z',
      weightKg: 12.5,
      lengthHeightCm: 90.0,
      position: 'STANDING' as const,
      origin: 'CAREGIVER' as const,
      recordedById: 'u0000000-0000-0000-0000-000000000001',
      recordedBy: null,
      correctedCheckupId: null,
      isCurrent: true,
      notes: null,
      createdAt: '2026-11-01T10:00:00.000Z',
    },
  ] as CaregiverCheckupResponse[],
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
  }),
  useLocalSearchParams: () => ({ childId: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../context/auth-context.js', () => ({
  useOptionalAuth: () => ({
    user: {
      id: 'u0000000-0000-0000-0000-000000000001',
      firstName: 'Andrea',
      lastName: 'Silva',
    },
  }),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({
    status: 'ready',
    children: mocks.children,
    error: null,
    load: vi.fn(async () => {}),
  }),
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: () => ({
    status: 'ready',
    checkups: mocks.checkups,
    error: null,
    load: vi.fn(async () => mocks.checkups),
  }),
}));

vi.mock('../hooks/useReferenceCurves.js', () => ({
  useReferenceCurves: () => ({
    status: 'ready',
    curves: {
      indicator: 'WEIGHT_FOR_AGE',
      sex: 'MALE',
      curves: {
        '-3': [
          { x: 0, y: 2 },
          { x: 60, y: 14 },
        ],
        '-2': [
          { x: 0, y: 2.5 },
          { x: 60, y: 16 },
        ],
        '0': [
          { x: 0, y: 3.3 },
          { x: 60, y: 18.3 },
        ],
        '+2': [
          { x: 0, y: 4.2 },
          { x: 60, y: 21 },
        ],
        '+3': [
          { x: 0, y: 4.8 },
          { x: 60, y: 23 },
        ],
      },
    },
    error: null,
    load: vi.fn(),
  }),
}));

vi.mock('../hooks/useGrowthTrend.js', () => ({
  useGrowthTrend: () => ({
    status: mocks.growthTrends ? 'ready' : 'idle',
    trends: mocks.growthTrends,
    error: null,
    load: vi.fn(),
  }),
}));

import EvolutionScreen from '../app/(caregiver)/evolution.js';

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

describe('EvolutionScreen Growth Trend (NK-74)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.growthTrends = null;
  });

  it('muestra «Tendencia favorable» SOLO cuando el indicador seleccionado tiene trend FAVORABLE', () => {
    mocks.growthTrends = [
      {
        indicator: 'WEIGHT_FOR_AGE',
        trend: 'FAVORABLE',
        basedOnCheckupId: 'c1111111-1111-4111-8111-111111111111',
      },
      {
        indicator: 'LENGTH_HEIGHT_FOR_AGE',
        trend: 'NONE',
        basedOnCheckupId: 'c1111111-1111-4111-8111-111111111111',
      },
    ];

    let capturedTree: unknown = null;
    function Wrapper() {
      capturedTree = EvolutionScreen();
      return capturedTree as React.ReactElement;
    }

    const html = renderToString(React.createElement(Wrapper));

    expect(html).toContain('Tendencia favorable');
    const trendElement = findElementByTestId(capturedTree, 'evolution-growth-trend');
    expect(trendElement).not.toBeNull();
  });

  it('NO muestra «Tendencia favorable» cuando el indicador seleccionado tiene trend NONE', () => {
    mocks.growthTrends = [
      {
        indicator: 'WEIGHT_FOR_AGE',
        trend: 'NONE',
        basedOnCheckupId: 'c1111111-1111-4111-8111-111111111111',
      },
    ];

    let capturedTree: unknown = null;
    function Wrapper() {
      capturedTree = EvolutionScreen();
      return capturedTree as React.ReactElement;
    }

    const html = renderToString(React.createElement(Wrapper));

    expect(html).not.toContain('Tendencia favorable');
    const trendElement = findElementByTestId(capturedTree, 'evolution-growth-trend');
    expect(trendElement).toBeNull();
  });

  it('NO muestra «Tendencia favorable» y no rompe la pantalla cuando no hay datos o falla', () => {
    mocks.growthTrends = null;

    let capturedTree: unknown = null;
    function Wrapper() {
      capturedTree = EvolutionScreen();
      return capturedTree as React.ReactElement;
    }

    const html = renderToString(React.createElement(Wrapper));

    expect(html).not.toContain('Tendencia favorable');
    expect(findElementByTestId(capturedTree, 'evolution-growth-trend')).toBeNull();
    expect(findElementByTestId(capturedTree, 'evolution-chart-card')).not.toBeNull();
  });
});
