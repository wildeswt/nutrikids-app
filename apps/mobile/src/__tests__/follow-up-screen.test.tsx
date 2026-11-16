import type * as ReactTypes from 'react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseFollowUpFormResult } from '../hooks/useFollowUpForm.js';
import { CHILD_ID, makeDetail } from './alerts-fixtures.js';

const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
}));

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  canGoBack: vi.fn(() => true),
  useFollowUpForm: vi.fn(),
  params: {} as Record<string, string>,
  effects: [] as (() => void)[],
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: mocks.back, replace: mocks.replace, canGoBack: mocks.canGoBack }),
  useLocalSearchParams: () => mocks.params,
}));

// Effects are collected, not run, by renderToString: the test runs them like a mounted screen.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useEffect: (effect: () => void) => mocks.effects.push(effect),
    useState: (initial: unknown) => {
      const slot = runtime.index++;
      if (!(slot in runtime.slots)) {
        runtime.slots[slot] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial;
      }
      const set = (value: unknown) => {
        runtime.slots[slot] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(runtime.slots[slot])
            : value;
      };
      return [runtime.slots[slot], set];
    },
  };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: { id: 'u1', firstName: 'Laura', lastName: 'Pérez', specialty: 'nutrition' },
  }),
}));

vi.mock('../hooks/useFollowUpForm.js', () => ({ useFollowUpForm: mocks.useFollowUpForm }));

// formatChildAge (children-api) loads the session storage.
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import FollowUpScreen from '../app/(professional)/follow-up.js';
import { APP_ROUTES } from '../constants/routes.js';

const ALERT_ID = makeDetail().id;
const load = vi.fn(async () => {});
const save = vi.fn(async (): Promise<'sent' | 'queued' | 'sentAlertNotMoved' | null> => 'sent');
const saveAsDraft = vi.fn(async () => {});
const setForm = vi.fn();

const mateo = {
  id: CHILD_ID,
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

function setHook(overrides: Partial<UseFollowUpFormResult> = {}) {
  mocks.useFollowUpForm.mockReturnValue({
    loading: false,
    fatalError: null,
    child: mateo,
    alertStatus: 'PENDING_REVIEW',
    form: {
      observations: '',
      intervention: '',
      referral: '',
      nextCheckupText: '',
      establish: true,
    },
    setForm,
    canEstablish: true,
    offline: false,
    saving: false,
    formError: null,
    apiError: null,
    notice: null,
    rejectedReason: null,
    alertNotMoved: null,
    load,
    save,
    saveAsDraft,
    ...overrides,
  } satisfies UseFollowUpFormResult);
}

interface Node {
  type?: unknown;
  props?: Record<string, unknown>;
}

function find(node: unknown, predicate: (n: Node) => boolean): Node | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = find(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const el = node as Node;
  if (predicate(el)) return el;
  if (typeof el.type === 'function' && el.type.name === 'ScreenHeader') {
    const rendered = (el.type as (props: Record<string, unknown>) => unknown)(el.props ?? {});
    const found = find(rendered, predicate);
    if (found) return found;
  }
  const branches = [el.props?.['children'], el.props?.['rightIcon']];
  for (const branch of branches) {
    for (const child of Array.isArray(branch) ? branch : [branch]) {
      const found = find(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function byTestId(testID: string): Node | null {
  runtime.index = 0;
  let tree: unknown = null;
  function Capture() {
    tree = FollowUpScreen();
    return null;
  }
  renderToString(React.createElement(Capture));
  return find(tree, (n) => n.props?.['testID'] === testID);
}

const html = () => {
  runtime.index = 0;
  return renderToString(React.createElement(FollowUpScreen));
};
const press = (testID: string) => (byTestId(testID)?.props?.['onPress'] as () => unknown)();

describe('FollowUpScreen (NK-34)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    runtime.slots.length = 0;
    runtime.index = 0;
    mocks.params = { alertId: ALERT_ID, childId: CHILD_ID };
    mocks.canGoBack.mockReturnValue(true);
    save.mockResolvedValue('sent');
    setHook();
  });

  it('opens the form for the alert and child of the route and loads on mount', () => {
    html();
    expect(mocks.useFollowUpForm).toHaveBeenCalledWith({ alertId: ALERT_ID, childId: CHILD_ID });
    mocks.effects.forEach((effect) => effect());
    expect(load).toHaveBeenCalled();
  });

  it('shows the title, the child banner and who writes the follow-up', () => {
    const out = html();
    expect(out).toContain('Seguimiento clínico');
    expect(out).toContain('Mateo Gómez');
    expect(out).toContain('Laura Pérez · Nutrición');
  });

  it('has the three sections (observaciones, intervención, derivación), next checkup and buttons', () => {
    const out = html();
    expect(out).toContain('Observaciones clínicas');
    expect(out).toContain('Intervención nutricional');
    expect(out).toContain('Derivación');
    expect(out).toContain('Próximo control');
    expect(out).toContain('DD/MM/AAAA (opcional)');
    expect(out).toContain('Guardar seguimiento');
    expect(out).toContain('Guardar como borrador');
  });

  describe('sections (NK-75)', () => {
    it('allows typing in observations, intervention, and referral', () => {
      const obsInput = byTestId('follow-up-observations');
      (obsInput?.props?.['onChangeText'] as (text: string) => void)('Nota de peso');
      expect(setForm).toHaveBeenCalledWith({ observations: 'Nota de peso' });

      const interInput = byTestId('follow-up-intervention');
      (interInput?.props?.['onChangeText'] as (text: string) => void)('Plan de alimentación');
      expect(setForm).toHaveBeenCalledWith({ intervention: 'Plan de alimentación' });

      const refInput = byTestId('follow-up-referral');
      (refInput?.props?.['onChangeText'] as (text: string) => void)('Derivar a pediatría');
      expect(setForm).toHaveBeenCalledWith({ referral: 'Derivar a pediatría' });
    });

    it('shows the filled section values', () => {
      setHook({
        form: {
          observations: 'Obs guardada',
          intervention: 'Inter guardada',
          referral: 'Ref guardada',
          nextCheckupText: '',
          establish: true,
        },
      });
      const out = html();
      expect(out).toContain('Obs guardada');
      expect(out).toContain('Inter guardada');
      expect(out).toContain('Ref guardada');
    });
  });

  describe('next checkup', () => {
    it('offers quick choices and fills the date when one is pressed', () => {
      expect(html()).toContain('1 semana');
      expect(html()).toContain('3 meses');
      press('follow-up-shortcut-14');
      expect(setForm).toHaveBeenCalledWith({
        nextCheckupText: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
      });
    });

    it('displays the chosen date in long format', () => {
      setHook({
        form: {
          observations: '',
          intervention: '',
          referral: '',
          nextCheckupText: '25/10/2026',
          establish: true,
        },
      });
      const out = html();
      expect(out).toContain('25 de octubre de 2026');
      expect(out).not.toContain('25/10/2026');
    });

    it('opens the date picker from the calendar icon and updates the date on selection', () => {
      expect(byTestId('follow-up-date-picker')).toBeNull();
      press('follow-up-date-picker-button');
      expect(byTestId('follow-up-date-picker')).not.toBeNull();

      const picker = byTestId('follow-up-date-picker');
      expect(picker?.props?.['minimumDate']).toBeInstanceOf(Date);
      const onChange = picker?.props?.['onChange'] as (
        event: { type: string },
        date?: Date,
      ) => void;
      onChange({ type: 'set' }, new Date(2026, 9, 25));
      expect(setForm).toHaveBeenCalledWith({ nextCheckupText: '25/10/2026' });
    });

    it('opens the date picker when tapping the date field itself', () => {
      press('follow-up-next-checkup');
      expect(html()).toContain('follow-up-date-picker');
    });

    it('can remove the chosen date', () => {
      setHook({
        form: {
          observations: '',
          intervention: '',
          referral: '',
          nextCheckupText: '25/11/2026',
          establish: true,
        },
      });
      press('follow-up-clear-date');
      expect(setForm).toHaveBeenCalledWith({ nextCheckupText: '' });
    });
  });

  describe('alert', () => {
    it('lets the professional choose whether the alert becomes «seguimiento establecido»', () => {
      expect(html()).toContain('follow-up-establish');
      press('follow-up-establish');
      expect(setForm).toHaveBeenCalledWith({ establish: false });
    });

    it('hides the choice when the alert cannot be moved', () => {
      setHook({ canEstablish: false });
      expect(html()).not.toContain('follow-up-establish');
    });
  });

  describe('offline', () => {
    it('shows the notice only without connection', () => {
      expect(html()).not.toContain('follow-up-offline');
      setHook({ offline: true });
      const out = html();
      expect(out).toContain('follow-up-offline');
      expect(out).toContain(
        'Sin conexión · Se guardará en este teléfono y se enviará al recuperar la conexión',
      );
    });
  });

  describe('saving', () => {
    it.each(['sent', 'queued'] as const)('goes back after it was %s', async (outcome) => {
      save.mockResolvedValue(outcome);
      await press('follow-up-save');
      expect(save).toHaveBeenCalled();
      expect(mocks.back).toHaveBeenCalled();
    });

    it('stays on the form when saving fails or the alert was not moved', async () => {
      save.mockResolvedValue(null);
      await press('follow-up-save');
      save.mockResolvedValue('sentAlertNotMoved');
      await press('follow-up-save');
      expect(mocks.back).not.toHaveBeenCalled();
    });

    it('disables the buttons and shows the saving label meanwhile', () => {
      setHook({ saving: true });
      expect(html()).toContain('Guardando...');
      expect(byTestId('follow-up-save')?.props?.['disabled']).toBe(true);
    });

    it('saves a draft from the second button and confirms it', () => {
      press('follow-up-save-draft');
      expect(saveAsDraft).toHaveBeenCalled();

      setHook({ notice: 'draftSaved' });
      expect(html()).toContain('Borrador guardado en este teléfono.');
    });
  });

  describe('messages', () => {
    it.each([
      [
        { code: 'atLeastOneRequired' },
        'Completa al menos una sección (observaciones, intervención o derivación).',
      ],
      [
        { code: 'detailsTooLong', field: 'observations', max: 2000 },
        'El detalle no puede pasar de 2000 caracteres.',
      ],
      [{ code: 'dateInvalid' }, 'Escribe la fecha como DD/MM/AAAA.'],
      [{ code: 'datePast' }, 'La fecha del próximo control no puede ser anterior a hoy.'],
    ] as const)('explains %o', (formError, text) => {
      setHook({ formError });
      expect(html()).toContain(text);
    });

    it('shows what the server answered', () => {
      setHook({ apiError: 'Falta el consentimiento informado' });
      expect(html()).toContain('Falta el consentimiento informado');
    });

    it('tells when the follow-up was saved but the alert did not move', () => {
      setHook({ alertNotMoved: 'Cambio concurrente' });
      expect(html()).toContain('El seguimiento se guardó, pero no pudimos actualizar la alerta');
    });

    it('tells that a draft was restored and why a queued follow-up was refused', () => {
      setHook({
        notice: 'draftRestored',
        rejectedReason: 'La fecha del próximo control es pasada',
      });
      const out = html();
      expect(out).toContain('Recuperamos tu borrador.');
      expect(out).toContain('El servidor no aceptó el seguimiento');
      expect(out).toContain('La fecha del próximo control es pasada');
    });
  });

  describe('states', () => {
    it('renders the loading state', () => {
      setHook({ loading: true });
      expect(html()).toContain('follow-up-loading');
    });

    it('renders the fatal error with a retry button', () => {
      setHook({ fatalError: 'Abre el seguimiento desde el detalle de una alerta.' });
      const out = html();
      expect(out).toContain('follow-up-error');
      expect(out).toContain('Abre el seguimiento desde el detalle de una alerta.');
      press('follow-up-retry');
      expect(load).toHaveBeenCalled();
    });

    it('falls back to a generic child name', () => {
      setHook({ child: null });
      expect(html()).toContain('Niño sin identificar');
    });
  });

  describe('navigation', () => {
    it('goes back when it can', () => {
      press('follow-up-back');
      expect(mocks.back).toHaveBeenCalled();
    });

    it('returns to the inbox when there is nothing to go back to', () => {
      mocks.canGoBack.mockReturnValue(false);
      press('follow-up-back');
      expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.PROFESSIONAL.ALERTS);
    });
  });
});
