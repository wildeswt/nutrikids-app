import type * as ReactTypes from 'react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as UseReferralTypes from '../hooks/useReferral.js';
import type { UseReferralResult } from '../hooks/useReferral.js';
import type * as ReferralFormTypes from '../lib/referral-form.js';
import { ReferralApiError } from '../lib/referrals-api.js';
import type * as ReferralsApiTypes from '../lib/referrals-api.js';

const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  refs: [] as { current: unknown }[],
  index: 0,
  refIndex: 0,
  effects: [] as (() => void | (() => void))[],
}));

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  canGoBack: vi.fn(() => true),
  params: {} as { childId?: string },
  useReferral: vi.fn(),
  fetchMyChildren: vi.fn(),
  fetchChildProfessionals: vi.fn(),
  createReferral: vi.fn(),
  loadReferralDraft: vi.fn(),
  saveReferralDraft: vi.fn(),
  clearReferralDraft: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: mocks.back, replace: mocks.replace, canGoBack: mocks.canGoBack }),
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
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
    useRef: (initial: unknown) => {
      const slot = runtime.refIndex++;
      runtime.refs[slot] ??= { current: initial };
      return runtime.refs[slot];
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => void | (() => void)) => {
      runtime.effects.push(effect);
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

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: {
      id: '99999999-9999-4999-8999-999999999999',
      firstName: 'Laura',
      lastName: 'Pérez',
      specialty: 'nutrition',
    },
  }),
}));

vi.mock('../hooks/useReferral.js', () => ({ useReferral: mocks.useReferral }));

vi.mock('../lib/referrals-api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ReferralsApiTypes>();
  return {
    ...actual,
    fetchMyChildren: mocks.fetchMyChildren,
    fetchChildProfessionals: mocks.fetchChildProfessionals,
    createReferral: mocks.createReferral,
  };
});

vi.mock('../lib/referral-form.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ReferralFormTypes>();
  return {
    ...actual,
    loadReferralDraft: mocks.loadReferralDraft,
    saveReferralDraft: mocks.saveReferralDraft,
    clearReferralDraft: mocks.clearReferralDraft,
  };
});

import ReferralScreen from '../app/(professional)/referral.js';
import { APP_ROUTES } from '../constants/routes.js';

const CHILD_1 = '11111111-1111-4111-8111-111111111111';
const CHILD_2 = '11111111-1111-4111-8111-111111111112';
const PROF_ID = '22222222-2222-4222-8222-222222222222';
const SELF_ID = '99999999-9999-4999-8999-999999999999';

const mateo = {
  id: CHILD_1,
  firstName: 'Mateo',
  lastName: 'Rodríguez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

const sofia = {
  id: CHILD_2,
  firstName: 'Sofía',
  lastName: 'López',
  birthDate: '2024-01-10',
  sex: 'FEMALE' as const,
};

const carlos = {
  id: '33333333-3333-4333-8333-333333333333',
  childId: CHILD_1,
  professionalId: PROF_ID,
  specialty: 'pediatrics',
  firstName: 'Carlos',
  lastName: 'Medina',
  startDate: '2026-01-01',
  endDate: null,
};

const load = vi.fn(async () => {});
const reloadRecipients = vi.fn(async () => {});
const selectChild = vi.fn();
const setForm = vi.fn();
const saveDraft = vi.fn(async () => {});
const submit = vi.fn(async () => true);

function setHook(overrides: Partial<UseReferralResult> = {}) {
  mocks.useReferral.mockReturnValue({
    loadingChildren: false,
    childrenError: null,
    children: [mateo, sofia],
    loadingRecipients: false,
    recipientsError: null,
    recipients: [carlos],
    form: {
      childId: CHILD_1,
      recipientId: PROF_ID,
      priority: 'ordinary',
      reason: '',
    },
    sending: false,
    formError: null,
    apiError: null,
    isOffline: false,
    notice: null,
    canSubmit: true,
    load,
    reloadRecipients,
    selectChild,
    setForm,
    saveDraft,
    submit,
    ...overrides,
  } satisfies UseReferralResult);
}

interface Node {
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
  const children = el.props?.['children'];
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function renderScreenHtml(): string {
  runtime.index = 0;
  runtime.refIndex = 0;
  return renderToString(React.createElement(ReferralScreen));
}

function byTestId(testID: string): Node | null {
  runtime.index = 0;
  runtime.refIndex = 0;
  let tree: unknown = null;
  function Capture() {
    tree = ReferralScreen();
    return null;
  }
  renderToString(React.createElement(Capture));
  return find(tree, (n) => n.props?.['testID'] === testID);
}

const press = (testID: string) => (byTestId(testID)?.props?.['onPress'] as () => unknown)();

describe('ReferralScreen (NK-51)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.slots.length = 0;
    runtime.refs.length = 0;
    runtime.effects.length = 0;
    mocks.params = { childId: CHILD_1 };
    mocks.canGoBack.mockReturnValue(true);
    submit.mockResolvedValue(true);
    setHook();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes initialChildId from route params and loads on mount', () => {
    renderScreenHtml();
    expect(mocks.useReferral).toHaveBeenCalledWith({ initialChildId: CHILD_1 });
    runtime.effects.forEach((effect) => effect());
    expect(load).toHaveBeenCalled();
  });

  it('renders Figma elements and omits the unsupported attachment checkbox', () => {
    const out = renderScreenHtml();
    expect(out).toContain('Interconsulta');
    expect(out).toContain('Comunicación entre profesionales');
    expect(out).toContain('Laura Pérez');
    expect(out).toContain('Nutrición');
    expect(out).toContain('Paciente');
    expect(out).toContain('Mateo Rodríguez');
    expect(out).toContain('Dirigida a');
    expect(out).toContain('Pediatría · Carlos Medina');
    expect(out).toContain('Motivo de la interconsulta');
    expect(out).toContain('Prioridad');
    expect(out).toContain('Ordinaria');
    expect(out).toContain('Prioritaria');
    expect(out).toContain('Enviar interconsulta');
    expect(out).toContain('Guardar borrador');
    expect(out).not.toContain('Incluir historial y último control');
  });

  it('shows patient and recipient dropdowns and updates selection', () => {
    press('referral-child-selector');
    expect(renderScreenHtml()).toContain('referral-child-menu');
    press(`referral-child-option-${CHILD_2}`);
    expect(selectChild).toHaveBeenCalledWith(CHILD_2);

    press('referral-recipient-selector');
    expect(renderScreenHtml()).toContain('referral-recipient-menu');
    press(`referral-recipient-option-${PROF_ID}`);
    expect(setForm).toHaveBeenCalledWith({ recipientId: PROF_ID });
  });

  it('switches priority and updates the discreet character counter limit', () => {
    press('referral-priority-priority');
    expect(setForm).toHaveBeenCalledWith({ priority: 'priority' });

    setHook({
      form: { childId: CHILD_1, recipientId: PROF_ID, priority: 'priority', reason: 'Hola' },
    });
    expect(renderScreenHtml()).toContain('4 / 1986');
  });

  it('shows clear message and disables sending when the child has no other linked professionals', () => {
    setHook({ recipients: [], canSubmit: false });
    const out = renderScreenHtml();
    expect(out).toContain('Este niño no tiene otros profesionales vinculados');
    expect(byTestId('referral-submit')?.props?.['disabled']).toBe(true);
  });

  it('shows brief confirmation and navigates back on successful submit', async () => {
    vi.useFakeTimers();
    await press('referral-submit');
    expect(submit).toHaveBeenCalled();

    setHook({ notice: 'sent' });
    expect(renderScreenHtml()).toContain('Interconsulta enviada.');

    vi.advanceTimersByTime(1000);
    expect(mocks.back).toHaveBeenCalled();
  });

  it('displays API errors (such as 403 or network) and saves drafts', () => {
    setHook({ apiError: 'No hay conexión con el servidor.' });
    expect(renderScreenHtml()).toContain('No hay conexión con el servidor.');

    press('referral-save-draft');
    expect(saveDraft).toHaveBeenCalled();

    setHook({ notice: 'draftSaved' });
    expect(renderScreenHtml()).toContain('Borrador guardado en este dispositivo.');
  });

  it('falls back to professional alerts inbox when there is no history to go back to', () => {
    mocks.canGoBack.mockReturnValue(false);
    press('referral-back');
    expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.PROFESSIONAL.ALERTS);
  });
});

describe('useReferral hook behavior (NK-51)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.slots.length = 0;
    runtime.refs.length = 0;
    mocks.fetchMyChildren.mockResolvedValue([mateo]);
    mocks.fetchChildProfessionals.mockResolvedValue([
      { ...carlos, id: 'self-assign', professionalId: SELF_ID },
      carlos,
    ]);
    mocks.loadReferralDraft.mockResolvedValue(null);
    mocks.saveReferralDraft.mockResolvedValue(undefined);
    mocks.clearReferralDraft.mockResolvedValue(undefined);
  });

  async function runHook(initialChildId?: string) {
    const mod = await vi.importActual<typeof UseReferralTypes>('../hooks/useReferral.js');
    const render = () => {
      runtime.index = 0;
      runtime.refIndex = 0;
      return mod.useReferral({ initialChildId });
    };
    return render;
  }

  it('excludes current user from recipients and disables submit when none remain', async () => {
    mocks.fetchChildProfessionals.mockResolvedValue([
      { ...carlos, id: 'only-self', professionalId: SELF_ID },
    ]);
    const render = await runHook(CHILD_1);
    await render().load();

    const hook = render();
    expect(hook.recipients).toEqual([]);
    expect(hook.canSubmit).toBe(false);
  });

  it('reuses the same UUID id on retry after network failure and preserves written text', async () => {
    mocks.createReferral
      .mockRejectedValueOnce(new ReferralApiError('No hay conexión con el servidor.', 0))
      .mockResolvedValueOnce({
        id: 'ref-1',
        childId: CHILD_1,
        senderId: SELF_ID,
        recipientId: PROF_ID,
        kind: 'referral',
        body: '[Prioritaria] Evaluar peso',
        sentAt: '2026-11-14T16:00:00.000Z',
        readAt: null,
      });

    const render = await runHook(CHILD_1);
    await render().load();
    render().setForm({ recipientId: PROF_ID, priority: 'priority', reason: 'Evaluar peso' });

    const firstOk = await render().submit();
    expect(firstOk).toBe(false);
    expect(render().isOffline).toBe(true);
    expect(render().form.reason).toBe('Evaluar peso');

    const secondOk = await render().submit();
    expect(secondOk).toBe(true);
    expect(mocks.createReferral).toHaveBeenCalledTimes(2);
    const firstId = (mocks.createReferral.mock.calls[0]![0] as { id: string }).id;
    const secondId = (mocks.createReferral.mock.calls[1]![0] as { id: string }).id;
    expect(firstId).toBe(secondId);
    expect(mocks.clearReferralDraft).toHaveBeenCalledWith(SELF_ID);
  });

  it('surfaces 403 error message clearly without losing the form', async () => {
    mocks.createReferral.mockRejectedValueOnce(
      new ReferralApiError('El niño no cuenta con consentimiento informado vigente', 403),
    );
    const render = await runHook(CHILD_1);
    await render().load();
    render().setForm({ recipientId: PROF_ID, reason: 'Motivo clínico' });

    const ok = await render().submit();
    expect(ok).toBe(false);
    expect(render().apiError).toBe('El niño no cuenta con consentimiento informado vigente');
    expect(render().form.reason).toBe('Motivo clínico');
  });

  it('restores a saved draft on open', async () => {
    mocks.loadReferralDraft.mockResolvedValue({
      childId: CHILD_1,
      recipientId: PROF_ID,
      priority: 'priority',
      body: 'Borrador previo',
      savedAt: '2026-11-14T12:00:00.000Z',
    });

    const render = await runHook();
    await render().load();

    const hook = render();
    expect(hook.notice).toBe('draftRestored');
    expect(hook.form).toEqual({
      childId: CHILD_1,
      recipientId: PROF_ID,
      priority: 'priority',
      reason: 'Borrador previo',
    });
  });
});
