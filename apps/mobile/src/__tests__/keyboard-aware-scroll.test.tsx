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

    expect(html).toContain('Agregar nuevo control');
    expect(html).toContain('Fecha del control');
    expect(html).toContain('Peso (kg)');
    expect(html).toContain('Talla (cm)');
    expect(html).toContain('Observaciones');
    expect(html).toContain('Guardar y calcular');
  });

  it('renders ChatDetailScreen with message list and bottom input bar', () => {
    const html = renderToString(React.createElement(ChatDetailScreen));

    expect(html).toContain('Equipo de Mateo');
    expect(html).toContain('Escribe un mensaje...');
    expect(html).toContain('Enviar');
  });
});
