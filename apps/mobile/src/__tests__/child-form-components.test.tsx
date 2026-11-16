import React from 'react';
import type * as ReactTypes from 'react';
import { renderToString } from 'react-dom/server';
import { StyleSheet } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

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

import { AgeNotice } from '../components/child-form/AgeNotice.js';
import { BirthDateField } from '../components/child-form/BirthDateField.js';
import { LinkedAccountNotice } from '../components/child-form/LinkedAccountNotice.js';
import { SexSelector } from '../components/child-form/SexSelector.js';
import { PALETTE } from '../constants/colors.js';
import i18n from '../i18n/index.js';
import { formatChildAge } from '../lib/children-api.js';

interface ElementWithProps {
  props?: {
    testID?: string;
    children?: unknown;
    style?: unknown;
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
  return (
    findElementByTestId(element.props?.children, testId) ??
    findElementByTestId(element.props?.['rightIcon'], testId)
  );
}

function findIconByName(node: unknown, name: string): ElementWithProps | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findIconByName(child, name);
      if (found) return found;
    }
    return null;
  }
  const element = node as ElementWithProps;
  if (element.props?.['name'] === name) return element;
  return (
    findIconByName(element.props?.children, name) ??
    findIconByName(element.props?.['rightIcon'], name)
  );
}

function resolveStyle(styleProp: unknown): Record<string, unknown> {
  const evaluated = typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return (StyleSheet.flatten(evaluated as never) ?? {}) as Record<string, unknown>;
}

function renderTree(renderFn: () => unknown): unknown {
  hookStore.rewind();
  let tree: unknown = null;
  function Wrapper() {
    tree = renderFn();
    return null;
  }
  renderToString(React.createElement(Wrapper));
  return tree;
}

function isoMonthsAgo(monthsAgo: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('Shared child form components (NK-68)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookStore.reset();
  });

  describe('SexSelector', () => {
    it('renders Niña left, Niño right, green selected pill and white checkmark', () => {
      const onChange = vi.fn();
      const element = (
        <SexSelector
          label="Sexo"
          value="MALE"
          onChange={onChange}
          femaleLabel="Niña"
          maleLabel="Niño"
          testID="sex-test"
        />
      );
      const html = renderToString(element);

      expect(html).toContain('Sexo');
      expect(html.indexOf('Niña')).toBeLessThan(html.indexOf('Niño'));
      expect(html).toContain('sex-test-MALE-check');
      expect(html).not.toContain('sex-test-FEMALE-check');

      const tree = renderTree(() =>
        SexSelector({
          label: 'Sexo',
          value: 'MALE',
          onChange,
          femaleLabel: 'Niña',
          maleLabel: 'Niño',
          testID: 'sex-test',
        }),
      );

      const femaleButton = findElementByTestId(tree, 'sex-test-FEMALE');
      const maleButton = findElementByTestId(tree, 'sex-test-MALE');
      expect(femaleButton?.props?.['accessibilityState']).toEqual({
        selected: false,
        disabled: false,
      });
      expect(maleButton?.props?.['accessibilityState']).toEqual({
        selected: true,
        disabled: false,
      });

      const maleStyle = resolveStyle(maleButton?.props?.style);
      const femaleStyle = resolveStyle(femaleButton?.props?.style);
      expect(maleStyle['backgroundColor']).toBe('#2D5F5A');
      expect(maleStyle['height']).toBe(50);
      expect(maleStyle['borderRadius']).toBe(25);
      expect(maleStyle['flex']).toBe(1);
      expect(femaleStyle['backgroundColor']).toBe('#F9F9F9');
      expect(femaleStyle['height']).toBe(50);
      expect(femaleStyle['borderRadius']).toBe(25);
      expect(femaleStyle['flex']).toBe(1);

      const checkIcon = findElementByTestId(maleButton, 'sex-test-MALE-check');
      expect(checkIcon?.props?.['name']).toBe('checkmark');
      expect(checkIcon?.props?.['color']).toBe('#FFFFFF');
      expect(findElementByTestId(femaleButton, 'sex-test-FEMALE-check')).toBeNull();

      (femaleButton?.props?.['onPress'] as () => void)();
      expect(onChange).toHaveBeenCalledWith('FEMALE');
    });
  });

  describe('LinkedAccountNotice', () => {
    it('renders people-outline icon and caregiver account name notice', () => {
      const html = renderToString(
        <LinkedAccountNotice accountName="Andrea Rodríguez" testID="linked-notice" />,
      );

      expect(html).toContain('people-outline');
      expect(html).toContain(
        i18n.t('caregiver:addChild.linkedAccountNotice', { name: 'Andrea Rodríguez' }),
      );
    });

    it('renders nothing when accountName is blank', () => {
      const html = renderToString(<LinkedAccountNotice accountName="   " />);
      expect(html).toBe('');
    });
  });

  describe('AgeNotice', () => {
    it('renders Figma green box with time-outline when age is 1 to 5 years', () => {
      const birthDateIso = isoMonthsAgo(41);
      const expectedAge = formatChildAge(birthDateIso);

      const html = renderToString(<AgeNotice birthDateIso={birthDateIso} testID="age-box" />);
      const tree = renderTree(() => AgeNotice({ birthDateIso, testID: 'age-box' }));

      expect(html).toContain(i18n.t('caregiver:addChild.ageInRangeNotice', { age: expectedAge }));
      const boxStyle = resolveStyle(findElementByTestId(tree, 'age-box')?.props?.style);
      expect(boxStyle['backgroundColor']).toBe('#E8F1F0');
      expect(boxStyle['borderRadius']).toBe(16);
      expect(boxStyle['padding']).toBe(14);

      const icon = findIconByName(tree, 'time-outline');
      expect(icon?.props?.['size']).toBe(22);
      expect(icon?.props?.['color']).toBe(PALETTE.primary);
    });

    it('renders out-of-range error notice when age is below 12 or above 60 months', () => {
      const tooYoung = isoMonthsAgo(6);
      const html = renderToString(<AgeNotice birthDateIso={tooYoung} testID="age-box" />);
      const tree = renderTree(() => AgeNotice({ birthDateIso: tooYoung, testID: 'age-box' }));

      expect(html).toContain('role="alert"');
      expect(html).toContain('alert-circle');
      expect(html).toContain(formatChildAge(tooYoung));
      const boxStyle = resolveStyle(findElementByTestId(tree, 'age-box')?.props?.style);
      expect(boxStyle['backgroundColor']).toBe(PALETTE.feedback.errorBg);

      const tooOld = isoMonthsAgo(72);
      const oldHtml = renderToString(<AgeNotice birthDateIso={tooOld} testID="age-box" />);
      expect(oldHtml).toContain('role="alert"');
    });

    it('renders nothing for invalid or future birth dates', () => {
      expect(renderToString(<AgeNotice birthDateIso="invalid" />)).toBe('');
      expect(renderToString(<AgeNotice birthDateIso="2099-01-01" />)).toBe('');
    });
  });

  describe('BirthDateField', () => {
    it('renders pill input with calendar icon, opens picker and updates date', () => {
      hookStore.enabled = true;
      const onChangeText = vi.fn();

      const props = {
        label: 'Fecha de nacimiento',
        value: '12/05/2023',
        onChangeText,
        placeholder: 'Ej. 14/11/2026',
        openPickerLabel: 'Abrir selector de fecha',
        closePickerLabel: 'Listo',
        testID: 'birth-date',
      };

      let tree = renderTree(() => BirthDateField(props));
      expect(findElementByTestId(tree, 'birth-date')?.props?.['value']).toBe('12/05/2023');
      expect(findElementByTestId(tree, 'birth-date')?.props?.['editable']).toBe(true);
      expect(findIconByName(tree, 'calendar-outline')).not.toBeNull();
      expect(findElementByTestId(tree, 'birth-date-picker')).toBeNull();

      const pickerButton = findElementByTestId(tree, 'birth-date-picker-button');
      (pickerButton?.props?.['onPress'] as () => void)();
      tree = renderTree(() => BirthDateField(props));

      const picker = findElementByTestId(tree, 'birth-date-picker');
      expect(picker).not.toBeNull();
      expect(picker?.props?.['mode']).toBe('date');

      const onChange = picker?.props?.['onChange'] as (
        event: { type: string; nativeEvent: { timestamp: number } },
        date?: Date,
      ) => void;
      const picked = new Date(2024, 2, 8);
      onChange({ type: 'set', nativeEvent: { timestamp: picked.getTime() } }, picked);

      expect(onChangeText).toHaveBeenCalledWith('08/03/2024');
      tree = renderTree(() => BirthDateField(props));
      expect(findElementByTestId(tree, 'birth-date-picker')).toBeNull();
    });

    it('respects editable=false and displays validation errors', () => {
      hookStore.enabled = true;
      const props = {
        label: 'Fecha de nacimiento',
        value: '12/05/2023',
        onChangeText: vi.fn(),
        error: 'Fecha inválida',
        editable: false,
        openPickerLabel: 'Abrir selector de fecha',
        closePickerLabel: 'Listo',
        testID: 'birth-date',
      };

      const html = renderToString(<BirthDateField {...props} />);
      expect(html).toContain('Fecha inválida');

      let tree = renderTree(() => BirthDateField(props));
      expect(findElementByTestId(tree, 'birth-date')?.props?.['editable']).toBe(false);

      const pickerButton = findElementByTestId(tree, 'birth-date-picker-button');
      (pickerButton?.props?.['onPress'] as () => void)();
      tree = renderTree(() => BirthDateField(props));
      expect(findElementByTestId(tree, 'birth-date-picker')).toBeNull();
    });
  });
});
