import type {
  CaregiverCheckupResponse,
  CheckupResponse,
  GrowthTrendResponse,
} from '@nutrikids/shared';
import React from 'react';
import type * as ReactTypes from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const CAREGIVER_CHECKUPS: CaregiverCheckupResponse[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    childId: MATEO.id,
    measuredAt: '2026-11-10T15:00:00.000Z',
    weightKg: 14.6,
    lengthHeightCm: 96.2,
    position: 'STANDING',
    origin: 'PROFESSIONAL',
    recordedById: '22222222-2222-4222-8222-222222222222',
    recordedBy: {
      userId: '22222222-2222-4222-8222-222222222222',
      firstName: 'Carolina',
      lastName: 'Díaz',
      role: 'PROFESSIONAL',
      specialty: 'pediatrics',
    },
    correctedCheckupId: null,
    isCurrent: true,
    notes: 'Control trimestral estable',
    createdAt: '2026-11-10T15:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    childId: MATEO.id,
    measuredAt: '2026-05-10T15:00:00.000Z',
    weightKg: 13.1,
    lengthHeightCm: 90.8,
    position: 'STANDING',
    origin: 'CAREGIVER',
    recordedById: 'u0000000-0000-0000-0000-000000000001',
    recordedBy: {
      userId: 'u0000000-0000-0000-0000-000000000001',
      firstName: 'Andrea',
      lastName: 'Silva',
      role: 'CAREGIVER',
      specialty: null,
    },
    correctedCheckupId: null,
    isCurrent: true,
    notes: 'Medición en casa',
    createdAt: '2026-05-10T15:00:00.000Z',
  },
];

const PROFESSIONAL_CHECKUPS: CheckupResponse[] = [
  {
    ...CAREGIVER_CHECKUPS[0]!,
    results: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        checkupId: CAREGIVER_CHECKUPS[0]!.id,
        indicator: 'WEIGHT_FOR_AGE',
        zScore: -0.45,
        percentile: 32.6,
        classification: 'NORMAL',
        referenceVersion: 'WHO-2006',
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        checkupId: CAREGIVER_CHECKUPS[0]!.id,
        indicator: 'LENGTH_HEIGHT_FOR_AGE',
        zScore: -1.1,
        percentile: 13.6,
        classification: 'NORMAL',
        referenceVersion: 'WHO-2006',
      },
    ],
  },
  {
    ...CAREGIVER_CHECKUPS[1]!,
    results: [
      {
        id: '10000000-0000-4000-8000-000000000003',
        checkupId: CAREGIVER_CHECKUPS[1]!.id,
        indicator: 'WEIGHT_FOR_AGE',
        zScore: -2.35,
        percentile: 0.9,
        classification: 'UNDERWEIGHT',
        referenceVersion: 'WHO-2006',
      },
    ],
  },
];

const series = (base: number, slope: number) =>
  Array.from({ length: 61 }, (_, x) => ({ x, y: base + slope * x }));

const CURVES = {
  version: 'WHO 2006' as const,
  indicator: 'WEIGHT_FOR_AGE' as const,
  sex: 'MALE' as const,
  xAxis: 'age_months' as const,
  curves: {
    '-3': series(6, 0.1),
    '-2': series(7, 0.12),
    '0': series(9, 0.16),
    '+2': series(11, 0.2),
    '+3': series(12, 0.24),
  },
};

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

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: {} as Record<string, string>,
  curvesQueries: [] as unknown[],
  growthTrends: [
    {
      indicator: 'WEIGHT_FOR_AGE',
      trend: 'FAVORABLE',
      basedOnCheckupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
  ] as GrowthTrendResponse | null,
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useLocalSearchParams: () => mocks.params,
  useFocusEffect: vi.fn(),
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
    children: [MATEO, VALENTINA],
    error: null,
    load: vi.fn(async () => {}),
  }),
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: () => ({
    status: 'ready',
    checkups: CAREGIVER_CHECKUPS,
    error: null,
    load: vi.fn(async () => CAREGIVER_CHECKUPS),
  }),
  useProfessionalCheckups: () => ({
    status: 'ready',
    checkups: PROFESSIONAL_CHECKUPS,
    error: null,
    load: vi.fn(async () => PROFESSIONAL_CHECKUPS),
  }),
}));

vi.mock('../hooks/useReferenceCurves.js', () => ({
  useReferenceCurves: (query: unknown) => {
    mocks.curvesQueries.push(query);
    return {
      status: 'ready',
      curves: CURVES,
      error: null,
      load: vi.fn(),
    };
  },
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
import ProfessionalChildrenScreen from '../app/(professional)/evolution.js';
import { GrowthChart } from '../components/GrowthChart.js';
import { Card } from '../components/ui/Card.js';
import i18n from '../i18n/index.js';

interface ElementWithProps {
  type?: unknown;
  props?: {
    testID?: string;
    children?: unknown;
    [key: string]: unknown;
  };
}

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
  if (element.type === GrowthChart || element.type === Card) {
    const prevEnabled = hookStore.enabled;
    hookStore.enabled = false;
    try {
      let rendered: unknown = null;
      function ExpandChild() {
        rendered = (element.type as (props: unknown) => unknown)(element.props);
        return null;
      }
      renderToString(React.createElement(ExpandChild));
      const foundInRendered = findElementByTestId(rendered, testId);
      if (foundInRendered) return foundInRendered;
    } finally {
      hookStore.enabled = prevEnabled;
    }
  }
  return findElementByTestId(element.props?.children, testId);
}

function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node && typeof node === 'object') {
    return textContent((node as ElementWithProps).props?.children);
  }
  return '';
}

function renderTree(Screen: () => unknown): unknown {
  hookStore.rewind();
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

describe('Pantalla Figura 6c — Evolución y Curvas OMS (RF-07, RF-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookStore.reset();
    mocks.params = {};
    mocks.curvesQueries = [];
  });

  it('Criterio 1: dibuja las 5 curvas de z (-3, -2, 0, +2 y +3) según el sexo del niño', () => {
    const html = renderToString(React.createElement(EvolutionScreen));

    expect(html).toContain('data-testid="growth-chart-upper-extreme"');
    expect(html).toContain('data-testid="growth-chart-upper-bound"');
    expect(html).toContain('data-testid="growth-chart-median"');
    expect(html).toContain('data-testid="growth-chart-lower-bound"');
    expect(html).toContain('data-testid="growth-chart-lower-extreme"');
    expect(mocks.curvesQueries.at(-1)).toMatchObject({
      indicator: 'WEIGHT_FOR_AGE',
      sex: 'MALE',
    });

    mocks.params = { childId: VALENTINA.id };
    renderToString(React.createElement(EvolutionScreen));
    expect(mocks.curvesQueries.at(-1)).toMatchObject({
      indicator: 'WEIGHT_FOR_AGE',
      sex: 'FEMALE',
    });
  });

  it('Criterio 2: al tocar un punto se muestra el detalle de ese control con quien lo registró', () => {
    hookStore.enabled = true;
    let tree = renderTree(EvolutionScreen as () => unknown);

    // Initially no older point is selected, only the latest checkup card is shown
    expect(findElementByTestId(tree, 'evolution-selected-checkup-card')).toBeNull();
    expect(textContent(findElementByTestId(tree, 'evolution-last-record-card'))).toContain(
      'Carolina Díaz',
    );

    // Tap the oldest point (index 0: 13.1 kg, 90.8 cm, recorded by caregiver)
    press(tree, 'growth-chart-point-pressable-0');
    tree = renderTree(EvolutionScreen as () => unknown);

    const selectedCard = findElementByTestId(tree, 'evolution-selected-checkup-card');
    expect(selectedCard).not.toBeNull();
    expect(textContent(selectedCard)).toContain('13,1 kg');
    expect(textContent(selectedCard)).toContain('90,8 cm');
    expect(textContent(selectedCard)).toContain('Medición en casa');
    expect(textContent(selectedCard)).toContain(i18n.t('caregiver:evolution.origin.CAREGIVER'));

    // Al cerrar el modal se oculta el detalle
    press(tree, 'evolution-checkup-modal-close');
    tree = renderTree(EvolutionScreen as () => unknown);
    expect(findElementByTestId(tree, 'evolution-selected-checkup-card')).toBeNull();
  });

  it('Criterio 3: las zonas entre líneas están rotuladas con texto en ambas vistas', () => {
    const caregiverTree = renderTree(EvolutionScreen as () => unknown);

    expect(textContent(findElementByTestId(caregiverTree, 'growth-chart-zone-label-upper'))).toBe(
      i18n.t('caregiver:evolution.zoneLabels.outer'),
    );
    expect(textContent(findElementByTestId(caregiverTree, 'growth-chart-zone-label-normal'))).toBe(
      i18n.t('caregiver:evolution.zoneLabels.normal'),
    );

    const professionalTree = renderTree(ProfessionalChildrenScreen as () => unknown);
    expect(
      textContent(findElementByTestId(professionalTree, 'growth-chart-zone-label-upper')),
    ).toBe(i18n.t('professional:children.zoneLabels.upper'));
    expect(
      textContent(findElementByTestId(professionalTree, 'growth-chart-zone-label-normal')),
    ).toBe(i18n.t('professional:children.zoneLabels.normal'));
    expect(
      textContent(findElementByTestId(professionalTree, 'growth-chart-zone-label-lower')),
    ).toBe(i18n.t('professional:children.zoneLabels.lower'));
  });

  it('Criterio 4: el profesional conserva el aviso permanente de apoyo a la valoración no diagnóstico', () => {
    const professionalTree = renderTree(ProfessionalChildrenScreen as () => unknown);
    const professionalNotice = findElementByTestId(
      professionalTree,
      'professional-evolution-non-diagnostic-notice',
    );
    expect(professionalNotice).not.toBeNull();
    expect(textContent(professionalNotice)).toBe(
      i18n.t('professional:children.nonDiagnosticNotice'),
    );
  });

  it('Criterio 5: el cuidador no ve z ni clasificaciones técnicas, mientras el profesional ve la vista completa y puede tocar puntos', () => {
    const caregiverHtml = renderToString(React.createElement(EvolutionScreen));
    expect(caregiverHtml).not.toMatch(/z\s*=|percentil|desnutrición|sobrepeso|\+3 DE|−3 DE/i);

    hookStore.enabled = true;
    let profTree = renderTree(ProfessionalChildrenScreen as () => unknown);
    const profHtml = renderToString(React.createElement(ProfessionalChildrenScreen));

    // Professional sees all 5 z-score labels on the curves (+3 DE, +2 DE, 0 DE, −2 DE, −3 DE)
    expect(profHtml).toContain('data-testid="growth-chart-z-label-+3"');
    expect(profHtml).toContain('data-testid="growth-chart-z-label-+2"');
    expect(profHtml).toContain('data-testid="growth-chart-z-label-0"');
    expect(profHtml).toContain('data-testid="growth-chart-z-label--2"');
    expect(profHtml).toContain('data-testid="growth-chart-z-label--3"');

    // Professional sees z-score, percentile and WHO technical classification for the latest checkup
    expect(textContent(findElementByTestId(profTree, 'professional-selected-zscore'))).toBe(
      'z = -0,45',
    );
    expect(textContent(findElementByTestId(profTree, 'professional-selected-percentile'))).toBe(
      'P32,6',
    );
    expect(textContent(findElementByTestId(profTree, 'professional-selected-classification'))).toBe(
      i18n.t('professional:children.classifications.NORMAL'),
    );

    // Tapping the older point (index 0) updates the professional technical card to z = -2,35 (Bajo peso)
    press(profTree, 'growth-chart-point-pressable-0');
    profTree = renderTree(ProfessionalChildrenScreen as () => unknown);
    expect(textContent(findElementByTestId(profTree, 'professional-selected-zscore'))).toBe(
      'z = -2,35',
    );
    expect(textContent(findElementByTestId(profTree, 'professional-selected-classification'))).toBe(
      i18n.t('professional:children.classifications.UNDERWEIGHT'),
    );
  });
});
