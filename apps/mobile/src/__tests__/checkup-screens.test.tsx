import React from 'react';
import type * as ReactTypes from 'react';
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

const makeCheckup = (id: string, measuredAt: string, weightKg: number, lengthHeightCm: number) => ({
  id,
  childId: MATEO.id,
  measuredAt,
  weightKg,
  lengthHeightCm,
  position: 'STANDING' as const,
  origin: 'CAREGIVER' as const,
  recordedById: '33333333-3333-4333-8333-333333333333',
  recordedBy: null,
  correctedCheckupId: null,
  isCurrent: true,
  notes: null,
  createdAt: measuredAt,
});

const CHECKUPS = [
  makeCheckup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-10T15:00:00.000Z', 14.6, 96.2),
  makeCheckup('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-08-10T15:00:00.000Z', 13.9, 93.4),
  makeCheckup('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2026-05-10T15:00:00.000Z', 13.1, 90.8),
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
  replace: vi.fn(),
  back: vi.fn(),
  params: {} as Record<string, string>,
  loadChildren: vi.fn(),
  loadCheckups: vi.fn(),
  loadCurves: vi.fn(),
  create: vi.fn(),
  children: {
    status: 'ready',
    children: [] as unknown[],
    error: null as string | null,
  },
  checkups: {
    status: 'ready',
    checkups: [] as unknown[],
    error: null as string | null,
    saving: false,
  },
  curves: {
    status: 'ready',
    curves: null as unknown,
    error: null as string | null,
  },
  curvesQueries: [] as unknown[],
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
  useFocusEffect: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('@react-native-community/datetimepicker', () => ({
  default: (props: Record<string, unknown>) => React.createElement('mock-date-picker', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({ ...mocks.children, load: mocks.loadChildren, create: vi.fn() }),
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: () => ({
    ...mocks.checkups,
    load: mocks.loadCheckups,
    create: mocks.create,
  }),
}));

vi.mock('../hooks/useReferenceCurves.js', () => ({
  useReferenceCurves: (query: unknown) => {
    mocks.curvesQueries.push(query);
    return { ...mocks.curves, load: mocks.loadCurves };
  },
}));

import AddCheckupScreen from '../app/(caregiver)/add-checkup.js';
import CheckupSavedScreen from '../app/(caregiver)/checkup-saved.js';
import EvolutionScreen from '../app/(caregiver)/evolution.js';
import i18n from '../i18n/index.js';
import { toCheckupSavedParams } from '../lib/checkup-route.js';

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
  return (
    findElementByTestId(element.props?.children, testId) ??
    findElementByTestId(element.props?.['rightIcon'], testId)
  );
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

const render = (Screen: () => React.ReactNode) => {
  hookStore.rewind();
  return renderToString(React.createElement(Screen));
};

beforeEach(() => {
  vi.clearAllMocks();
  hookStore.reset();
  mocks.params = {};
  mocks.children = { status: 'ready', children: [MATEO], error: null };
  mocks.checkups = { status: 'ready', checkups: CHECKUPS, error: null, saving: false };
  mocks.curves = { status: 'ready', curves: CURVES, error: null };
  mocks.curvesQueries = [];
});

describe('AddCheckupScreen («Anotar un nuevo control»)', () => {
  it('shows the real child and the empty measurement form, without demo data', () => {
    const html = render(AddCheckupScreen);

    expect(html).toContain('Mateo');
    expect(html).toContain('Gómez');
    expect(html).not.toContain('Mateo José Rodríguez');
    expect(html).toContain(i18n.t('caregiver:addCheckup.title'));
    expect(html).toContain(i18n.t('caregiver:addCheckup.submit'));
    expect(html).not.toContain('12,2');
    expect(html).not.toContain('97,0');
  });

  it('hides «Cambiar paciente» when the caregiver has a single child', () => {
    const tree = renderTree(AddCheckupScreen as () => unknown);
    expect(findElementByTestId(tree, 'change-child-button')).toBeNull();
  });

  it('offers «Cambiar paciente» when there are several children', () => {
    mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };

    const tree = renderTree(AddCheckupScreen as () => unknown);

    expect(findElementByTestId(tree, 'change-child-button')).not.toBeNull();
  });

  it('opens on the child received in the route params', () => {
    mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };
    mocks.params = { childId: VALENTINA.id };

    const html = render(AddCheckupScreen);

    expect(html).toContain('Valentina');
    expect(html).not.toContain('Mateo');
  });

  it('shows a loading state while the children load', () => {
    mocks.children = { status: 'loading', children: [], error: null };

    const html = render(AddCheckupScreen);

    expect(html).toContain(i18n.t('caregiver:addCheckup.loading'));
    expect(html).not.toContain(i18n.t('caregiver:addCheckup.submit'));
  });

  it('shows the error with a retry that reloads the children', () => {
    mocks.children = { status: 'error', children: [], error: 'Sin conexión' };

    const tree = renderTree(AddCheckupScreen as () => unknown);
    expect(render(AddCheckupScreen)).toContain('Sin conexión');

    press(tree, 'add-checkup-retry');
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a way to register a child', () => {
    mocks.children = { status: 'empty', children: [], error: null };

    const html = render(AddCheckupScreen);
    expect(html).toContain(i18n.t('caregiver:addCheckup.emptyTitle'));

    press(renderTree(AddCheckupScreen as () => unknown), 'add-checkup-add-child');
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.CONSENT,
      params: { mode: 'register' },
    });
  });

  it('shows no z-scores or classifications (RF-14)', () => {
    const html = render(AddCheckupScreen);

    expect(html).not.toMatch(/z-?score|percentil|desnutrición/i);
  });

  it('opens the date picker when pressing the calendar icon and updates the date field', () => {
    hookStore.enabled = true;
    let tree = renderTree(AddCheckupScreen as () => unknown);

    expect(findElementByTestId(tree, 'add-checkup-date-picker')).toBeNull();

    press(tree, 'add-checkup-date-picker-button');
    tree = renderTree(AddCheckupScreen as () => unknown);

    const picker = findElementByTestId(tree, 'add-checkup-date-picker');
    expect(picker).not.toBeNull();
    expect(picker?.props?.['mode']).toBe('date');

    const onChange = picker?.props?.['onChange'] as
      | ((event: { type: string; nativeEvent: { timestamp: number } }, date?: Date) => void)
      | undefined;
    expect(onChange).toBeTypeOf('function');

    const picked = new Date(2026, 9, 18);
    onChange!({ type: 'set', nativeEvent: { timestamp: picked.getTime() } }, picked);
    tree = renderTree(AddCheckupScreen as () => unknown);

    expect(findElementByTestId(tree, 'add-checkup-date-input')?.props?.['value']).toBe(
      '18/10/2026',
    );
    expect(findElementByTestId(tree, 'add-checkup-date-picker')).toBeNull();
  });
});

describe('CheckupSavedScreen («¡Control guardado!»)', () => {
  const savedCheckup = {
    measuredAt: '2026-11-10T15:00:00.000Z',
    weightKg: 13.4,
    lengthHeightCm: 91.5,
    position: 'RECUMBENT' as const,
  };

  it('shows the checkup returned by the API, not the sample one', () => {
    mocks.params = toCheckupSavedParams(VALENTINA, savedCheckup);

    const html = render(CheckupSavedScreen);

    expect(html).toContain('Valentina');
    expect(html).toContain('13,4 kg');
    expect(html).toContain('91,5 cm');
    expect(html).toContain(i18n.t('caregiver:addCheckup.positions.RECUMBENT'));
    expect(html).toContain('10 de noviembre de 2026');
    expect(html).not.toContain('12,2 kg');
    expect(html).not.toContain('97,0 cm');
    expect(html).not.toContain('Mateo');
  });

  it('goes to the evolution of the same child', () => {
    mocks.params = toCheckupSavedParams(VALENTINA, savedCheckup);

    const tree = renderTree(CheckupSavedScreen as () => unknown);
    const primary = findElementByTestId(tree, 'checkup-saved-see-evolution');
    (primary?.props?.['onPress'] as () => void)();

    expect(mocks.replace).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.EVOLUTION,
      params: { childId: VALENTINA.id },
    });
  });

  it('shows a message and a way home when it is opened without a checkup', () => {
    mocks.params = {};

    const html = render(CheckupSavedScreen);

    expect(html).toContain(i18n.t('caregiver:checkupSaved.missing'));
    expect(html).toContain(i18n.t('caregiver:checkupSaved.goHome'));
    expect(html).not.toContain(i18n.t('caregiver:checkupSaved.seeEvolution'));
  });
});

describe('EvolutionScreen («Cómo crece»)', () => {
  it('shows the last real checkup card with date, measurements, origin and the 4 indicator codes', () => {
    const html = render(EvolutionScreen);
    const tree = renderTree(EvolutionScreen as () => unknown);

    expect(html).toContain(i18n.t('caregiver:evolution.title', { name: 'Mateo' }));
    expect(html).toContain(i18n.t('caregiver:evolution.lastRecordTitle'));
    expect(html).toContain('14,6 kg');
    expect(html).toContain('96,2 cm');
    expect(html).toContain('10 de noviembre de 2026');
    expect(html).toContain(i18n.t('caregiver:evolution.recordedBy'));
    expect(html).toContain(i18n.t('caregiver:evolution.origin.CAREGIVER'));
    expect(html).not.toContain('13,8 kg');
    expect(html).not.toContain('Dra. Ana Juarez');
    expect(html).not.toContain('Tendencia');

    const lastCard = findElementByTestId(tree, 'evolution-last-record-card');
    expect(lastCard).not.toBeNull();
    expect(textContent(lastCard)).toContain('14,6 kg');
    expect(textContent(lastCard)).toContain('96,2 cm');
    expect(textContent(lastCard)).toContain('10 de noviembre de 2026');
    expect(textContent(lastCard)).toContain(i18n.t('caregiver:evolution.origin.CAREGIVER'));

    for (const key of ['PE', 'TE', 'PT', 'IMCE'] as const) {
      const tab = findElementByTestId(tree, `evolution-indicator-${key}`);
      expect(tab).not.toBeNull();
      expect(textContent(tab)).toBe(i18n.t(`caregiver:evolution.indicators.${key}.code`));
      expect(tab?.props?.['accessibilityLabel']).toBe(
        i18n.t(`caregiver:evolution.indicators.${key}.name`),
      );
    }
  });

  it('draws one point per real checkup, dashed WHO bounds and no axis borders', () => {
    const html = render(EvolutionScreen);

    expect(html.match(/data-testid="growth-chart-point"/g)).toHaveLength(CHECKUPS.length);
    expect(html).toContain('data-testid="growth-chart-band"');
    expect(html).toContain('data-testid="growth-chart-median"');
    expect(html).toContain('data-testid="growth-chart-upper-bound"');
    expect(html).toContain('data-testid="growth-chart-lower-bound"');
    expect(html).not.toContain('border-left-width:1px');
    expect(html).not.toContain('border-bottom-width:1px');

    // The latest point sits to the right of and above the oldest one.
    const positions = [...html.matchAll(/style="([^"]*)" data-testid="growth-chart-point"/g)].map(
      (match) => ({
        left: Number(/left:([\d.]+)px/.exec(match[1]!)?.[1]),
        top: Number(/top:(-?[\d.]+)px/.exec(match[1]!)?.[1]),
      }),
    );
    expect(positions).toHaveLength(3);
    const [oldest, , latest] = positions as [
      (typeof positions)[number],
      (typeof positions)[number],
      (typeof positions)[number],
    ];
    expect(latest.left).toBeGreaterThan(oldest.left);
    expect(latest.top).toBeLessThan(oldest.top);
  });

  it('opens the WHO chart info modal when pressing (i) and closes it on «Entendido»', () => {
    hookStore.enabled = true;
    let tree = renderTree(EvolutionScreen as () => unknown);

    expect(findElementByTestId(tree, 'evolution-chart-info-modal')?.props?.['visible']).toBe(false);

    press(tree, 'evolution-chart-info-button');
    tree = renderTree(EvolutionScreen as () => unknown);

    const modal = findElementByTestId(tree, 'evolution-chart-info-modal');
    expect(modal?.props?.['visible']).toBe(true);
    expect(textContent(modal)).toContain(i18n.t('caregiver:evolution.infoModal.whoBand'));
    expect(textContent(modal)).toContain(i18n.t('caregiver:evolution.infoModal.childLine'));

    press(tree, 'evolution-chart-info-close');
    tree = renderTree(EvolutionScreen as () => unknown);
    expect(findElementByTestId(tree, 'evolution-chart-info-modal')?.props?.['visible']).toBe(false);
  });

  it('requests the curves of the child sex and indicator (position only for P/T)', () => {
    render(EvolutionScreen);

    expect(mocks.curvesQueries.at(-1)).toEqual({ indicator: 'WEIGHT_FOR_AGE', sex: 'MALE' });
  });

  it('uses the child received in the route params', () => {
    mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };
    mocks.params = { childId: VALENTINA.id };

    const html = render(EvolutionScreen);

    expect(html).toContain(i18n.t('caregiver:evolution.title', { name: 'Valentina' }));
    expect(mocks.curvesQueries.at(-1)).toMatchObject({ sex: 'FEMALE' });
  });

  it('shows no z-scores or classifications (RF-14)', () => {
    const html = render(EvolutionScreen);

    expect(html).not.toMatch(/z-?score|percentil|desnutrición|sobrepeso/i);
  });

  it('shows a loading state while the children or checkups load', () => {
    mocks.children = { status: 'loading', children: [], error: null };
    expect(render(EvolutionScreen)).toContain('data-testid="evolution-loading"');

    mocks.children = { status: 'ready', children: [MATEO], error: null };
    mocks.checkups = { status: 'loading', checkups: [], error: null, saving: false };
    expect(render(EvolutionScreen)).toContain('data-testid="evolution-loading"');
  });

  it('shows the children error with a retry', () => {
    mocks.children = { status: 'error', children: [], error: 'Sin conexión' };

    const tree = renderTree(EvolutionScreen as () => unknown);
    expect(render(EvolutionScreen)).toContain('Sin conexión');

    press(tree, 'evolution-retry');
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);
  });

  it('shows the checkups error with a retry', () => {
    mocks.checkups = { status: 'error', checkups: [], error: 'Falló la carga', saving: false };

    const tree = renderTree(EvolutionScreen as () => unknown);
    expect(render(EvolutionScreen)).toContain('Falló la carga');

    press(tree, 'evolution-retry');
    expect(mocks.loadCheckups).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when the caregiver has no children', () => {
    mocks.children = { status: 'empty', children: [], error: null };

    expect(render(EvolutionScreen)).toContain(i18n.t('caregiver:evolution.emptyChildrenTitle'));
  });

  it('invites to add the first checkup when the child has none', () => {
    mocks.checkups = { status: 'empty', checkups: [], error: null, saving: false };

    const html = render(EvolutionScreen);
    expect(html).toContain(i18n.t('caregiver:evolution.noCheckupsTitle', { name: 'Mateo' }));
    expect(html).not.toContain('data-testid="growth-chart-point"');

    press(renderTree(EvolutionScreen as () => unknown), 'evolution-add-checkup');
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.ADD_CHECKUP,
      params: { childId: MATEO.id },
    });
  });

  it('shows a loading state while the curves load', () => {
    mocks.curves = { status: 'loading', curves: null, error: null };

    const html = render(EvolutionScreen);

    expect(html).toContain('data-testid="evolution-curves-loading"');
    expect(html).not.toContain('data-testid="growth-chart-point"');
    // The last checkup is still shown.
    expect(html).toContain('14,6 kg');
  });

  it('shows the curves error with a retry and keeps the last checkup', () => {
    mocks.curves = { status: 'error', curves: null, error: 'Curvas no disponibles' };

    const tree = renderTree(EvolutionScreen as () => unknown);
    const html = render(EvolutionScreen);

    expect(html).toContain('Curvas no disponibles');
    expect(html).toContain('14,6 kg');

    const error = findElementByTestId(tree, 'evolution-curves-error');
    expect(error).not.toBeNull();
    press(error, 'evolution-retry');
    expect(mocks.loadCurves).toHaveBeenCalledTimes(1);
  });
});
