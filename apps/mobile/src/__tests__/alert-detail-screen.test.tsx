import React from 'react';
import type * as RN from 'react-native';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseAlertDetailResult } from '../hooks/useAlertDetail.js';
import { CHILD_ID, makeCheckup, makeDetail } from './alerts-fixtures.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
  useAlertDetail: vi.fn(),
  pending: { pendingCount: 0, refreshPending: vi.fn(async () => {}) },
  focusEffects: [] as (() => void)[],
  width: 390,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
    canGoBack: mocks.canGoBack,
  }),
  useFocusEffect: (cb: () => void) => mocks.focusEffects.push(cb),
  useLocalSearchParams: () => ({ alertId: '22222222-2222-4222-8222-222222222222' }),
}));

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof RN>();
  return { ...actual, useWindowDimensions: () => ({ width: mocks.width, height: 800, scale: 1 }) };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

// formatChildAge (children-api) loads the session storage.
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('../hooks/useAlertDetail.js', () => ({ useAlertDetail: mocks.useAlertDetail }));
vi.mock('../hooks/usePendingFollowUps.js', () => ({
  usePendingFollowUps: () => mocks.pending,
}));

import AlertDetailScreen from '../app/(professional)/alert-detail.js';
import { APP_ROUTES } from '../constants/routes.js';

const reload = vi.fn(async () => {});
const markReviewed = vi.fn(async () => true);

const mateo = {
  id: CHILD_ID,
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

function setHook(overrides: Partial<UseAlertDetailResult> = {}) {
  mocks.useAlertDetail.mockReturnValue({
    alert: makeDetail(),
    child: mateo,
    checkups: [
      makeCheckup(
        { id: '99999999-9999-4999-8999-999999999999', measuredAt: '2026-08-10T08:00:00.000Z' },
        -0.4,
      ),
      makeCheckup({ measuredAt: '2026-11-10T08:00:00.000Z' }, -3.4),
    ],
    loading: false,
    error: null,
    marking: false,
    actionError: null,
    reload,
    markReviewed,
    ...overrides,
  } satisfies UseAlertDetailResult);
}

interface Node {
  type?: unknown;
  props?: Record<string, unknown>;
}

/** Walks an element tree (without rendering) and returns the first node matching `predicate`. */
function find(node: unknown, predicate: (n: Node) => boolean): Node | null {
  if (!node || typeof node !== 'object') return null;
  const el = node as Node;
  if (predicate(el)) return el;
  if (typeof el.type === 'function' && el.type.name === 'ScreenHeader') {
    const rendered = (el.type as (props: Record<string, unknown>) => unknown)(el.props ?? {});
    const found = find(rendered, predicate);
    if (found) return found;
  }
  const children = el.props?.['children'];
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function screenTree(): unknown {
  let tree: unknown = null;
  function Capture() {
    tree = AlertDetailScreen();
    return null;
  }
  renderToString(React.createElement(Capture));
  return tree;
}

function byTestId(testID: string): Node | null {
  return find(screenTree(), (n) => n.props?.['testID'] === testID);
}

const html = () => renderToString(React.createElement(AlertDetailScreen));

describe('AlertDetailScreen (NK-33)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusEffects.length = 0;
    mocks.width = 390;
    mocks.pending.pendingCount = 0;
    mocks.canGoBack.mockReturnValue(true);
    setHook();
  });

  it('loads the alert for the route param', () => {
    html();
    expect(mocks.useAlertDetail).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });

  it('refreshes the pending follow-up count, then reloads, when the screen gains focus', async () => {
    html();
    mocks.focusEffects.forEach((cb) => cb());
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(mocks.pending.refreshPending).toHaveBeenCalled();
  });

  it('tells how many follow-ups are waiting on the phone', () => {
    expect(html()).not.toContain('alert-detail-pending');
    mocks.pending.pendingCount = 2;
    expect(html()).toContain('Tienes 2 seguimientos guardados en este teléfono por enviar.');
    mocks.pending.pendingCount = 1;
    expect(html()).toContain('Tienes 1 seguimiento guardado en este teléfono por enviar.');
  });

  it('shows the child banner, the indicator, the result and the reason', () => {
    const out = html();
    expect(out).toContain('Detalle de alerta');
    expect(out).toContain('Mateo Gómez');
    expect(out).toContain('Peso para la edad');
    expect(out).toContain('Pendiente de revisión');
    expect(out).toContain('Grave');
    expect(out).toContain('Puntaje z por debajo de −3');
    expect(out).toContain('Peso muy bajo para la edad');
  });

  it('shows the checkup that raised the alert with date, weight and height', () => {
    const out = html();
    expect(out).toContain('10 de noviembre de 2026');
    expect(out).toContain('12,2 kg');
    expect(out).toContain('97,0 cm');
    expect(out).not.toContain('Observaciones:');
  });

  it('shows checkup notes in the Control row when present', () => {
    setHook({ checkups: [makeCheckup({ notes: 'Control tras cuadro viral' })] });
    const out = html();
    expect(out).toContain('Observaciones: Control tras cuadro viral');
  });

  it('marks the overdue tag only when the alert is overdue', () => {
    expect(html()).not.toContain('alert-detail-overdue');
    setHook({ alert: makeDetail({ isOverdue: true }) });
    expect(html()).toContain('alert-detail-overdue');
  });

  it('draws the chart with the checkup of the alert highlighted', () => {
    const out = html();
    expect(out).toContain('Evolución del indicador');
    expect(out).toContain('Puntaje z de Peso para la edad (OMS)');
    expect(out).toContain('z-chart-alert-point');
    expect(out.match(/z-chart-point/g)).toHaveLength(1);
    expect(out).toContain('Control que originó la alerta');
  });

  it('lists the complete status history with who changed it and when', () => {
    const out = html();
    expect(out).toContain('Historial de estados');
    expect(out).toContain('alert-detail-history-entry-0');
    expect(out).toContain('alert-detail-history-entry-1');
    expect(out).toContain('Generada');
    expect(out).toContain('Por Laura Pérez');
    expect(out).toContain('Por Carlos Sánchez');
    expect(out).toMatch(/10 de noviembre de 2026 · \d{2}:\d{2}/);
  });

  it('shows every entry of a longer history', () => {
    const history = makeDetail().history;
    setHook({
      alert: makeDetail({
        status: 'FOLLOW_UP_ESTABLISHED',
        history: [
          ...history,
          { ...history[1]!, status: 'REVIEWED', changedAt: '2026-11-11T09:00:00.000Z' },
          {
            ...history[1]!,
            status: 'FOLLOW_UP_ESTABLISHED',
            changedAt: '2026-11-12T09:00:00.000Z',
          },
        ],
      }),
    });
    const out = html();
    for (let i = 0; i < 4; i += 1) expect(out).toContain(`alert-detail-history-entry-${i}`);
    expect(out).toContain('Revisada');
    expect(out).toContain('Con seguimiento');
  });

  describe('actions', () => {
    it('offers "Marcar como revisada" while the alert is pending review and calls the hook', () => {
      expect(html()).toContain('Marcar como revisada');
      (byTestId('alert-detail-mark-reviewed')?.props?.['onPress'] as () => void)();
      expect(markReviewed).toHaveBeenCalled();
    });

    it('disables the button and shows the saving label while marking', () => {
      setHook({ marking: true });
      const out = html();
      expect(out).toContain('Guardando...');
      expect(byTestId('alert-detail-mark-reviewed')?.props?.['disabled']).toBe(true);
    });

    it('shows the API message when the review fails', () => {
      setHook({ actionError: 'Transición no permitida' });
      expect(html()).toContain('Transición no permitida');
    });

    it('hides the review button once the alert was reviewed and keeps the follow-up', () => {
      setHook({ alert: makeDetail({ status: 'REVIEWED' }) });
      const out = html();
      expect(out).not.toContain('alert-detail-mark-reviewed');
      expect(out).toContain('Ya marcaste esta alerta como revisada.');
      expect(out).toContain('alert-detail-follow-up');
    });

    it('has no actions left once the follow-up is established', () => {
      setHook({ alert: makeDetail({ status: 'FOLLOW_UP_ESTABLISHED' }) });
      const out = html();
      expect(out).not.toContain('alert-detail-mark-reviewed');
      expect(out).not.toContain('alert-detail-follow-up');
      expect(out).toContain('seguimiento establecido');
    });

    it('opens the follow-up form with the alert and the child', () => {
      (byTestId('alert-detail-follow-up')?.props?.['onPress'] as () => void)();
      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.PROFESSIONAL.FOLLOW_UP,
        params: { alertId: makeDetail().id, childId: CHILD_ID },
      });
    });

    it('opens the referral screen with the child preselected', () => {
      (byTestId('alert-detail-referral')?.props?.['onPress'] as () => void)();
      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.PROFESSIONAL.REFERRAL,
        params: { childId: CHILD_ID },
      });
    });
  });

  describe('states', () => {
    it('renders the loading state before the first load', () => {
      setHook({ alert: null, child: null, checkups: null, loading: true });
      const out = html();
      expect(out).toContain('alert-detail-loading');
      expect(out).toContain('Cargando la alerta...');
    });

    it('renders the error with a retry button that reloads', () => {
      setHook({ alert: null, child: null, checkups: null, error: 'Alerta no encontrada' });
      const out = html();
      expect(out).toContain('alert-detail-error');
      expect(out).toContain('Alerta no encontrada');
      (byTestId('alert-detail-retry')?.props?.['onPress'] as () => void)();
      expect(reload).toHaveBeenCalled();
    });

    it('keeps the content on screen while reloading on focus', () => {
      setHook({ loading: true });
      const out = html();
      expect(out).toContain('alert-detail-card');
      expect(out).not.toContain('alert-detail-loading');
    });

    it('shows a notice with retry in the chart when the checkups could not be loaded', () => {
      setHook({ checkups: null });
      const out = html();
      expect(out).toContain('alert-detail-chart-error');
      expect(out).toContain('Control no disponible');
      // The chart card is a child component: its retry callback is passed as a prop.
      (
        find(screenTree(), (n) => typeof n.props?.['onRetry'] === 'function')?.props?.[
          'onRetry'
        ] as () => void
      )();
      expect(reload).toHaveBeenCalled();
    });

    it('shows the empty chart state when there are no checkups to plot', () => {
      setHook({ checkups: [] });
      expect(html()).toContain('alert-detail-chart-empty');
    });

    it('falls back to a generic name when the child could not be loaded', () => {
      setHook({ child: null });
      expect(html()).toContain('Niño sin identificar');
    });
  });

  describe('navigation', () => {
    it('goes back when it can', () => {
      (byTestId('alert-detail-back')?.props?.['onPress'] as () => void)();
      expect(mocks.back).toHaveBeenCalled();
    });

    it('returns to the inbox when there is nothing to go back to (opened from a push)', () => {
      mocks.canGoBack.mockReturnValue(false);
      (byTestId('alert-detail-back')?.props?.['onPress'] as () => void)();
      expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.PROFESSIONAL.ALERTS);
    });
  });

  describe('responsive layout', () => {
    it('stacks the sections in one column on a phone', () => {
      mocks.width = 390;
      const out = html();
      expect(out).toContain('alert-detail-narrow');
      expect(out).not.toContain('alert-detail-wide');
    });

    it('uses two columns on a tablet, with the same content', () => {
      mocks.width = 820;
      const out = html();
      expect(out).toContain('alert-detail-wide');
      expect(out).not.toContain('alert-detail-narrow');
      for (const id of [
        'alert-detail-card',
        'alert-detail-chart-card',
        'alert-detail-history',
        'alert-detail-actions',
      ]) {
        expect(out).toContain(id);
      }
    });
  });
});
