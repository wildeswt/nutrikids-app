import React from 'react';
import type * as ReactTypes from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PALETTE } from '../constants/colors.js';
import { APP_ROUTES } from '../constants/routes.js';
import { FeedingApiError } from '../lib/feeding-api.js';

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

const hookStore = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  stateCursor: 0,
  refCursor: 0,
  reset() {
    this.states = [];
    this.refs = [];
    this.stateCursor = 0;
    this.refCursor = 0;
  },
  rewind() {
    this.stateCursor = 0;
    this.refCursor = 0;
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const idx = hookStore.stateCursor++;
      if (!(idx in hookStore.states)) {
        if (typeof initial === 'function') {
          hookStore.states[idx] = (initial as () => T)();
        } else {
          hookStore.states[idx] = initial;
        }
      }
      const setState = (updater: T | ((prev: T) => T)) => {
        const prev = hookStore.states[idx] as T;
        if (typeof updater === 'function') {
          hookStore.states[idx] = (updater as (prev: T) => T)(prev);
        } else {
          hookStore.states[idx] = updater;
        }
      };
      return [hookStore.states[idx] as T, setState] as const;
    },
    useRef<T>(initial: T) {
      const idx = hookStore.refCursor++;
      if (!(idx in hookStore.refs)) {
        hookStore.refs[idx] = { current: initial };
      }
      return hookStore.refs[idx] as React.RefObject<T>;
    },
  };
});

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: true,
  params: {} as Record<string, string>,
  loadChildren: vi.fn(),
  create: vi.fn(),
  children: {
    status: 'ready',
    children: [] as unknown[],
    error: null as string | null,
  },
  feeding: { saving: false },
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
    canGoBack: () => mocks.canGoBack,
  }),
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({ ...mocks.children, load: mocks.loadChildren, create: vi.fn() }),
}));

vi.mock('../hooks/useFeedingLog.js', () => ({
  useFeedingLog: () => ({ ...mocks.feeding, create: mocks.create }),
}));

import FeedingScreen from '../app/(caregiver)/feeding.js';
import i18n from '../i18n/index.js';

interface ElementWithProps {
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

function renderTree(): unknown {
  hookStore.rewind();
  let tree: unknown = null;
  function Wrapper() {
    tree = FeedingScreen();
    return null;
  }
  renderToString(React.createElement(Wrapper));
  return tree;
}

function renderHtml(): string {
  hookStore.rewind();
  return renderToString(React.createElement(FeedingScreen));
}

function press(tree: unknown, testId: string): unknown {
  const onPress = findElementByTestId(tree, testId)?.props?.['onPress'] as
    (() => unknown) | undefined;
  expect(onPress, `no onPress for ${testId}`).toBeTypeOf('function');
  return onPress!();
}

async function pressAsync(tree: unknown, testId: string): Promise<void> {
  press(tree, testId);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function changeText(tree: unknown, testId: string, value: string): void {
  const onChangeText = findElementByTestId(tree, testId)?.props?.['onChangeText'] as
    ((val: string) => void) | undefined;
  expect(onChangeText, `no onChangeText for ${testId}`).toBeTypeOf('function');
  onChangeText!(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  hookStore.reset();
  mocks.canGoBack = true;
  mocks.params = {};
  mocks.children = { status: 'ready', children: [MATEO], error: null };
  mocks.feeding = { saving: false };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FeedingScreen («Alimentación»)', () => {
  it('renders child banner, 5 meal checkboxes, meals counter and notes field', () => {
    const html = renderHtml();

    expect(html).toContain('Mateo');
    expect(html).toContain('Gómez');
    expect(html).toContain('Registro del ');
    expect(html).toContain(i18n.t('caregiver:feeding.title'));
    expect(html).toContain(i18n.t('caregiver:feeding.mealsTodayLabel'));
    expect(html).toContain(i18n.t('caregiver:feeding.mealsCountLabel'));
    expect(html).toContain(i18n.t('caregiver:feeding.notesLabel'));
    expect(html).toContain(i18n.t('caregiver:feeding.submit'));

    const tree = renderTree();
    for (const meal of ['breakfast', 'morningSnack', 'lunch', 'afternoonSnack', 'dinner']) {
      const box = findElementByTestId(tree, `feeding-meal-${meal}`);
      expect(box?.props?.['accessibilityRole']).toBe('checkbox');
      expect(box?.props?.['accessibilityState']).toEqual({ checked: false });
    }
    expect(findElementByTestId(tree, 'feeding-notes-input')?.props?.['maxLength']).toBe(500);
  });

  it('syncs counter with meals and enforces manual +/- bounds 0–12', () => {
    let tree = renderTree();
    expect(textContent(findElementByTestId(tree, 'feeding-meals-count'))).toBe('0 comidas');
    expect(findElementByTestId(tree, 'feeding-meals-decrease')?.props?.['disabled']).toBe(true);

    press(tree, 'feeding-meal-breakfast');
    tree = renderTree();
    const breakfastBox = findElementByTestId(tree, 'feeding-meal-breakfast');
    expect(breakfastBox?.props?.['accessibilityState']).toEqual({ checked: true });
    expect(textContent(findElementByTestId(tree, 'feeding-meals-count'))).toBe('1 comida');

    press(tree, 'feeding-meal-lunch');
    tree = renderTree();
    expect(textContent(findElementByTestId(tree, 'feeding-meals-count'))).toBe('2 comidas');

    // Ajuste manual con + y -
    press(tree, 'feeding-meals-increase');
    tree = renderTree();
    expect(textContent(findElementByTestId(tree, 'feeding-meals-count'))).toBe('3 comidas');

    press(tree, 'feeding-meals-increase');
    tree = renderTree();
    expect(textContent(findElementByTestId(tree, 'feeding-meals-count'))).toBe('4 comidas');

    // Al volver a marcar/desmarcar una casilla, sincroniza con las casillas marcadas (3)
    press(tree, 'feeding-meal-dinner');
    tree = renderTree();
    expect(textContent(findElementByTestId(tree, 'feeding-meals-count'))).toBe('3 comidas');

    // Límite superior en 12
    for (let i = 0; i < 15; i += 1) {
      press(tree, 'feeding-meals-increase');
      tree = renderTree();
    }
    expect(textContent(findElementByTestId(tree, 'feeding-meals-count'))).toBe('12 comidas');
    expect(findElementByTestId(tree, 'feeding-meals-increase')?.props?.['disabled']).toBe(true);
  });

  it('saves feeding log, shows brief confirmation, and navigates back', async () => {
    mocks.create.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      childId: MATEO.id,
      logDate: '2026-10-18',
      mealsPerDay: 2,
      details: 'Comidas: Desayuno, Cena. Sopa de pollo',
    });

    let tree = renderTree();
    press(tree, 'feeding-meal-breakfast');
    tree = renderTree();
    press(tree, 'feeding-meal-dinner');
    tree = renderTree();
    changeText(tree, 'feeding-notes-input', '  Sopa de pollo  ');
    tree = renderTree();

    await pressAsync(tree, 'submit-feeding-button');

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      logDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      mealsPerDay: 2,
      details: 'Comidas: Desayuno, Cena. Sopa de pollo',
    });

    tree = renderTree();
    const successText = textContent(findElementByTestId(tree, 'feeding-success-banner'));
    expect(successText).toContain(i18n.t('caregiver:feeding.savedSuccess'));

    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it('shows offline saved confirmation and navigates back when queued locally', async () => {
    mocks.create.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      childId: MATEO.id,
      logDate: '2026-10-18',
      mealsPerDay: 1,
      details: 'Comidas: Almuerzo.',
      savedLocally: true,
    });

    let tree = renderTree();
    press(tree, 'feeding-meal-lunch');
    tree = renderTree();

    await pressAsync(tree, 'submit-feeding-button');
    tree = renderTree();

    const bannerText = textContent(findElementByTestId(tree, 'feeding-success-banner'));
    expect(bannerText).toBe(
      'Sin conexión · se guardó en este dispositivo y se enviará al reconectar',
    );
    expect(findElementByTestId(tree, 'feeding-error-banner')).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it('shows offline error, preserves form, and retries with the same id', async () => {
    const offlineMsg = i18n.t('errors:feeding.network');
    const networkErr = new FeedingApiError(offlineMsg, 0, { isNetwork: true });
    mocks.create.mockRejectedValueOnce(networkErr).mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
      childId: MATEO.id,
      logDate: '2026-10-18',
      mealsPerDay: 1,
      details: 'Comidas: Almuerzo. Arroz con lentejas',
    });

    let tree = renderTree();
    press(tree, 'feeding-meal-lunch');
    tree = renderTree();
    changeText(tree, 'feeding-notes-input', 'Arroz con lentejas');
    tree = renderTree();

    await pressAsync(tree, 'submit-feeding-button');
    tree = renderTree();

    const errorText = textContent(findElementByTestId(tree, 'feeding-error-banner'));
    expect(errorText).toBe(
      'Necesitas conexión para guardar la alimentación. Inténtalo de nuevo cuando vuelvas a tener internet.',
    );
    const notesInput = findElementByTestId(tree, 'feeding-notes-input');
    expect(notesInput?.props?.['value']).toBe('Arroz con lentejas');
    const lunchBox = findElementByTestId(tree, 'feeding-meal-lunch');
    expect(lunchBox?.props?.['accessibilityState']).toEqual({ checked: true });

    await pressAsync(tree, 'submit-feeding-button');
    expect(mocks.create).toHaveBeenCalledTimes(2);
    const firstPayload = mocks.create.mock.calls[0]![0] as { id: string };
    const secondPayload = mocks.create.mock.calls[1]![0] as { id: string };
    expect(secondPayload.id).toBe(firstPayload.id);
  });

  it('shows consent banner on 403 consent error and navigates to consent screen', async () => {
    const consentMsg =
      'El niño no cuenta con un consentimiento informado vigente para registrar datos';
    mocks.create.mockRejectedValue(new FeedingApiError(consentMsg, 403));

    let tree = renderTree();
    press(tree, 'feeding-meal-breakfast');
    tree = renderTree();

    await pressAsync(tree, 'submit-feeding-button');
    tree = renderTree();

    const banner = findElementByTestId(tree, 'consent-required');
    expect(banner).not.toBeNull();
    const consentText = textContent(banner);
    expect(consentText).toContain(i18n.t('caregiver:feeding.consentRequired', { name: 'Mateo' }));

    press(tree, 'go-to-consent-button');
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.CONSENT,
      params: { childId: MATEO.id, childName: 'Mateo', mode: 'view' },
    });
  });

  it('selects child from route params and handles loading, error and empty states', () => {
    mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };
    mocks.params = { childId: VALENTINA.id };
    const html = renderHtml();
    expect(html).toContain('Valentina');
    expect(html).not.toContain('Mateo');

    mocks.children = { status: 'loading', children: [], error: null };
    expect(renderHtml()).toContain(i18n.t('caregiver:feeding.loading'));

    mocks.children = { status: 'error', children: [], error: 'Sin conexión' };
    const errTree = renderTree();
    expect(textContent(findElementByTestId(errTree, 'feeding-error'))).toContain('Sin conexión');
    press(errTree, 'feeding-retry');
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);

    mocks.children = { status: 'empty', children: [], error: null };
    const emptyTree = renderTree();
    const emptyText = textContent(findElementByTestId(emptyTree, 'feeding-empty'));
    expect(emptyText).toContain(i18n.t('caregiver:feeding.emptyTitle'));
  });

  it('uses gray borders on unchecked boxes/counter and #575757 Volver', () => {
    let tree = renderTree();

    const uncheckedBox = findElementByTestId(tree, 'feeding-meal-box-breakfast');
    expect(uncheckedBox?.props?.['style']).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: PALETTE.border.checkbox })]),
    );

    press(tree, 'feeding-meal-breakfast');
    tree = renderTree();

    const checkedBox = findElementByTestId(tree, 'feeding-meal-box-breakfast');
    expect(checkedBox?.props?.['style']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: PALETTE.primary,
          borderColor: PALETTE.primary,
        }),
      ]),
    );

    const counter = findElementByTestId(tree, 'feeding-meals-counter');
    expect(counter?.props?.['style']).toMatchObject({ borderColor: PALETTE.border.checkbox });

    const decBtn = findElementByTestId(tree, 'feeding-meals-decrease');
    const decStyleFn = decBtn?.props?.['style'] as (s: { pressed: boolean }) => unknown[];
    expect(decStyleFn({ pressed: false })).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: PALETTE.border.checkbox })]),
    );

    const backBtn = findElementByTestId(tree, 'feeding-back-button');
    const backChildren = backBtn?.props?.children as ElementWithProps[] | undefined;
    const backLabel = backChildren?.find((child) => textContent(child) === 'Volver');
    expect(backLabel?.props?.['style']).toMatchObject({ color: PALETTE.text.title });
  });
});
