import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ params: {} as Record<string, string> }));

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mocks.params,
}));
vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

import ChildRegisteredScreen from '../app/(caregiver)/child-registered.js';

describe('ChildRegisteredScreen', () => {
  beforeEach(() => {
    mocks.params = {
      childId: '11111111-1111-4111-8111-111111111111',
      childName: 'Mateo',
      birthDate: '2023-06-05',
    };
  });

  it('shows the success message, the link offer and both actions', () => {
    const html = renderToString(React.createElement(ChildRegisteredScreen));
    expect(html).toContain('¡Niño registrado!');
    expect(html).toContain('Mateo - ');
    expect(html).toContain('¿Quieres vincular a su profesional?');
    expect(html).toContain('controles y las alertas de Mateo');
    expect(html).toContain('También puedes hacerlo después desde Mis niños.');
    expect(html).toContain('Vincular profesional');
    expect(html).toContain('Ahora no');
  });

  it('falls back to a go-home screen when the params are missing', () => {
    mocks.params = {};
    const html = renderToString(React.createElement(ChildRegisteredScreen));
    expect(html).toContain('child-registered-missing');
    expect(html).not.toContain('Ahora no');
  });
});
