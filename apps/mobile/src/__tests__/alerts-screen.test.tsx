import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseAlertsResult } from '../hooks/useAlerts.js';
import { CHILD_ID, makeAlert } from './alerts-fixtures.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useAlerts: vi.fn(),
  focusEffects: [] as (() => void)[],
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push, back: vi.fn(), canGoBack: () => true, replace: vi.fn() }),
  useFocusEffect: (cb: () => void) => mocks.focusEffects.push(cb),
  useLocalSearchParams: () => ({ alertId: '22222222-2222-4222-8222-222222222222' }),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('../hooks/useAlerts.js', () => ({ useAlerts: mocks.useAlerts }));

// The screen imports ALERT_STATUS_FILTERS from alerts-api, which loads the session storage.
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import AlertDetailScreen from '../app/(professional)/alert-detail.js';
import AlertsInboxScreen from '../app/(professional)/index.js';
import { APP_ROUTES } from '../constants/routes.js';

const reload = vi.fn(async () => {});
const refresh = vi.fn(async () => {});

function setHook(overrides: Partial<UseAlertsResult> = {}) {
  mocks.useAlerts.mockReturnValue({
    alerts: [],
    childNames: {},
    loading: false,
    refreshing: false,
    error: null,
    reload,
    refresh,
    ...overrides,
  } satisfies UseAlertsResult);
}

interface Node {
  props?: Record<string, unknown>;
}

type RenderItem = (arg: { item: unknown }) => React.ReactElement<{ onPress: () => void }>;

/** Walks an element tree (without rendering) and returns the first node matching `predicate`. */
function find(node: unknown, predicate: (n: Node) => boolean): Node | null {
  if (!node || typeof node !== 'object') return null;
  const el = node as Node;
  if (predicate(el)) return el;
  const children = el.props?.['children'];
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function captureTree(Screen: () => React.ReactNode): unknown {
  let tree: unknown = null;
  function Capture() {
    tree = Screen();
    return null;
  }
  renderToString(React.createElement(Capture));
  return tree;
}

function getList(): Node {
  const list = find(
    captureTree(AlertsInboxScreen),
    (n) => typeof n.props?.['renderItem'] === 'function',
  );
  if (!list) throw new Error('FlatList not rendered');
  return list;
}

describe('AlertsInboxScreen (NK-32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusEffects.length = 0;
    setHook();
  });

  it('asks for the open alerts by default and shows the three status chips', () => {
    const html = renderToString(React.createElement(AlertsInboxScreen));

    expect(mocks.useAlerts).toHaveBeenCalledWith(['GENERATED', 'PENDING_REVIEW']);
    expect(html).toContain('Sin revisar');
    expect(html).toContain('Generadas');
    expect(html).toContain('Pendientes de revisión');
  });

  it('reloads when the screen gains focus', () => {
    renderToString(React.createElement(AlertsInboxScreen));
    mocks.focusEffects.forEach((cb) => cb());
    expect(reload).toHaveBeenCalled();
  });

  it('renders the loading state', () => {
    setHook({ loading: true });
    const html = renderToString(React.createElement(AlertsInboxScreen));
    expect(html).toContain('alerts-loading');
    expect(html).toContain('Cargando alertas...');
  });

  it('renders the error with a retry button that reloads', () => {
    setHook({ error: 'No pudimos cargar las alertas.' });
    const html = renderToString(React.createElement(AlertsInboxScreen));
    expect(html).toContain('No pudimos cargar las alertas.');

    const retry = find(
      captureTree(AlertsInboxScreen),
      (n) => n.props?.['testID'] === 'alerts-retry',
    );
    (retry?.props?.['onPress'] as () => void)();
    expect(reload).toHaveBeenCalled();
  });

  it('renders the empty state and no overdue banner', () => {
    const html = renderToString(React.createElement(AlertsInboxScreen));
    expect(html).toContain('alerts-empty');
    expect(html).toContain('No hay alertas en este estado');
    expect(html).not.toContain('alerts-overdue-summary');
  });

  it('renders each card with child, indicator, risk, age and overdue tag, in the given order', () => {
    const severeOverdue = makeAlert({
      id: '22222222-2222-4222-8222-222222222221',
      isOverdue: true,
      createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    });
    const mild = makeAlert({
      id: '22222222-2222-4222-8222-222222222222',
      indicator: 'BMI_FOR_AGE',
      riskType: 'OVERWEIGHT',
      isSevere: false,
      status: 'GENERATED',
      createdAt: new Date().toISOString(),
    });
    setHook({ alerts: [severeOverdue, mild], childNames: { [CHILD_ID]: 'Mateo Gómez' } });

    const list = getList();
    expect((list.props?.['data'] as { id: string }[]).map((a) => a.id)).toEqual([
      severeOverdue.id,
      mild.id,
    ]);

    const renderItem = list.props?.['renderItem'] as RenderItem;
    const html = renderToString(
      React.createElement(
        'div',
        null,
        renderItem({ item: severeOverdue }),
        renderItem({ item: mild }),
      ),
    );
    expect(html).toContain('Mateo Gómez');
    expect(html).toContain('Peso para la edad');
    expect(html).toContain('Bajo peso · Grave');
    expect(html).toContain('Pendiente de revisión');
    expect(html).toContain('Hace 3 días');
    expect(html).toContain(`alert-overdue-${severeOverdue.id}`);
    expect(html).toContain('IMC para la edad');
    expect(html).toContain('Sobrepeso');
    expect(html).toContain('Hoy');
    expect(html).not.toContain(`alert-overdue-${mild.id}`);
  });

  it('shows the overdue summary counting only overdue alerts', () => {
    setHook({
      alerts: [
        makeAlert({ id: '22222222-2222-4222-8222-222222222221', isOverdue: true }),
        makeAlert({ id: '22222222-2222-4222-8222-222222222222', isOverdue: true }),
        makeAlert({ id: '22222222-2222-4222-8222-222222222223' }),
      ],
    });
    const html = renderToString(React.createElement(AlertsInboxScreen));
    expect(html).toContain('2 alertas vencidas sin revisar');
  });

  it('falls back to a generic label when the child name is unknown', () => {
    setHook({ alerts: [makeAlert()] });
    const renderItem = getList().props?.['renderItem'] as RenderItem;
    const html = renderToString(
      React.createElement('div', null, renderItem({ item: makeAlert() })),
    );
    expect(html).toContain('Niño sin identificar');
  });

  it('navigates to the detail route with the alertId when a card is pressed', () => {
    const alert = makeAlert();
    setHook({ alerts: [alert] });
    const renderItem = getList().props?.['renderItem'] as RenderItem;

    renderItem({ item: alert }).props.onPress();

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.PROFESSIONAL.ALERT_DETAIL,
      params: { alertId: alert.id },
    });
  });

  it('wires pull-to-refresh to refresh', () => {
    const control = getList().props?.['refreshControl'] as {
      props: { onRefresh: () => void };
    };
    control.props.onRefresh();
    expect(refresh).toHaveBeenCalled();
  });
});

describe('AlertDetailScreen placeholder', () => {
  it('shows the alert id received as route param', () => {
    const html = renderToString(React.createElement(AlertDetailScreen));
    expect(html).toContain('22222222-2222-4222-8222-222222222222');
    expect(html).toContain('Detalle de la alerta');
  });
});
