import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

// The checkup form only renders once the caregiver's children are loaded.
vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({
    status: 'ready',
    children: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        firstName: 'Mateo',
        lastName: 'Gómez',
        birthDate: '2023-06-15',
        sex: 'MALE',
      },
    ],
    error: null,
    load: vi.fn(),
    create: vi.fn(),
  }),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

import AddCheckupScreen from '../app/(caregiver)/add-checkup.js';
import ChatDetailScreen from '../app/(caregiver)/chat-detail.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../components/KeyboardAwareScrollView.js';
import i18n from '../i18n/index.js';

describe('KeyboardAwareScrollView & Keyboard-Avoiding Screens', () => {
  it('renders KeyboardAwareScrollView with KeyboardAwareTextInput children', () => {
    const html = renderToString(
      React.createElement(
        KeyboardAwareScrollView,
        null,
        React.createElement(KeyboardAwareTextInput, {
          placeholder: 'Campo de prueba',
          value: 'Valor inicial',
        }),
      ),
    );

    expect(html).toContain('Campo de prueba');
    expect(html).toContain('Valor inicial');
  });

  it('renders AddCheckupScreen with all numeric and multiline inputs inside KeyboardAwareScrollView', () => {
    const html = renderToString(React.createElement(AddCheckupScreen));

    expect(html).toContain(i18n.t('caregiver:addCheckup.title'));
    expect(html).toContain(i18n.t('caregiver:addCheckup.dateLabel'));
    expect(html).toContain(i18n.t('caregiver:addCheckup.weightLabel'));
    expect(html).toContain(i18n.t('caregiver:addCheckup.heightLabel'));
    expect(html).toContain(i18n.t('caregiver:addCheckup.notesLabel'));
    expect(html).toContain(i18n.t('caregiver:addCheckup.submit'));
  });

  it('renders ChatDetailScreen with message list and bottom input bar', () => {
    const html = renderToString(React.createElement(ChatDetailScreen));

    expect(html).toContain('Equipo de Mateo');
    expect(html).toContain(i18n.t('caregiver:chat.inputPlaceholder'));
    expect(html).toContain('Enviar');
  });
});
