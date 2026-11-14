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
  useFocusEffect: vi.fn(),
  useLocalSearchParams: () => ({
    childId: '11111111-1111-4111-8111-111111111111',
    withUserId: '33333333-3333-4333-8333-333333333333',
    participantName: 'Dra. Laura Pérez',
    participantRole: 'PROFESSIONAL',
    participantSpecialty: 'nutrition',
  }),
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
      id: '22222222-2222-4222-8222-222222222222',
      email: 'andrea@example.com',
      firstName: 'Andrea',
      lastName: 'Gómez',
      roles: ['CAREGIVER'],
      specialty: null,
    },
    activeRole: 'CAREGIVER',
    status: 'authenticated',
  }),
}));

vi.mock('../hooks/useMessageThread.js', () => ({
  useMessageThread: () => ({
    messages: [
      {
        id: '44444444-4444-4444-8444-444444444441',
        childId: '11111111-1111-4111-8111-111111111111',
        senderId: '33333333-3333-4333-8333-333333333333',
        recipientId: '22222222-2222-4222-8222-222222222222',
        kind: 'message',
        body: 'Hola, ¿cómo ha estado Mateo?',
        sentAt: '2026-10-18T09:32:00.000Z',
        readAt: null,
      },
    ],
    loading: false,
    loadingMore: false,
    refreshing: false,
    sending: false,
    hasMore: false,
    error: null,
    sendError: null,
    clearSendError: vi.fn(),
    reload: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    refreshSilent: vi.fn(async () => {}),
    loadOlder: vi.fn(async () => {}),
    send: vi.fn(async () => true),
    retryMessage: vi.fn(async () => true),
  }),
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
