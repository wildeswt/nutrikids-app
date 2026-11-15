import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MATEO = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Rodríguez',
  birthDate: '2023-06-05',
  sex: 'MALE' as const,
};

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  load: vi.fn(),
  children: { status: 'ready', children: [] as unknown[] },
}));

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
  useFocusEffect: vi.fn(),
}));
vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));
vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({ ...mocks.children, load: mocks.load, error: null }),
}));

import LinkProfessionalScreen from '../app/(caregiver)/link-professional.js';

describe('LinkProfessionalScreen', () => {
  beforeEach(() => {
    mocks.params = { childId: MATEO.id };
    mocks.children = { status: 'ready', children: [MATEO] };
  });

  it('renders the Figma layout: banner, license field, search, link and cancel', () => {
    const html = renderToString(React.createElement(LinkProfessionalScreen));
    expect(html).toContain('Vincular profesional');
    expect(html).toContain('Mateo Rodríguez');
    expect(html).toContain('Registro profesional');
    expect(html).toContain('Te lo da tu profesional de salud.');
    expect(html).toContain('Buscar profesional');
    expect(html).toContain('Vincular a Mateo');
    expect(html).toContain('Cancelar');
  });

  it('does not show a result card before searching', () => {
    const html = renderToString(React.createElement(LinkProfessionalScreen));
    expect(html).not.toContain('professional-result');
    expect(html).not.toContain('Podrá ver los controles');
  });

  it('shows a state message when the child is not found', () => {
    mocks.children = { status: 'ready', children: [] };
    const html = renderToString(React.createElement(LinkProfessionalScreen));
    expect(html).toContain('link-professional-state');
    expect(html).not.toContain('Registro profesional');
  });
});
