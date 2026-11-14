import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';
import type { ChildrenHookState } from '../hooks/useChildren.js';
import * as childrenApi from '../lib/children-api.js';
import { CURRENT_CONSENT_VERSION } from '../lib/consent-api.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  childrenHookState: {
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
  } as ChildrenHookState & { load: () => Promise<void>; create: Mock },
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
  }),
  useFocusEffect: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../constants/assets.js', () => ({
  APP_ASSETS: {
    LOGO: { uri: 'mock-logo.png' },
  },
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: {
      id: 'u0000000-0000-0000-0000-000000000001',
      firstName: 'Andrea',
      lastName: 'Silva',
      email: 'andrea@example.com',
      roles: ['CAREGIVER'],
    },
    activeRole: 'CAREGIVER',
    switchRole: vi.fn(),
    signOut: vi.fn(),
    status: 'authenticated',
  }),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => mocks.childrenHookState,
}));

import AddChildScreen, { type AddChildScreenProps } from '../app/(caregiver)/add-child.js';
import CaregiverHomeScreen from '../app/(caregiver)/index.js';

describe('Caregiver Screens (NK-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CaregiverHomeScreen («Mis niños» - Figura 6a)', () => {
    it('renders personalized greeting with caregiver name', () => {
      const html = renderToString(React.createElement(CaregiverHomeScreen));
      expect(html).toContain('¡Hola, Andrea!');
    });

    it('renders child card with clear language status, dashed add card, and no z-scores', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
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
      };

      const html = renderToString(React.createElement(CaregiverHomeScreen));

      // Child name and age
      expect(html).toContain('Mateo');
      expect(html).toContain('Gómez');

      // Status in clear language (text + icon)
      expect(html).toContain('Todo en orden');

      // Dashed add child card and privacy notice
      expect(html).toContain('Solo ves a los niños vinculados a tu cuenta');

      // Acceptance criterion: No technical WHO z-scores shown to caregiver
      expect(html).not.toContain('zPE');
      expect(html).not.toContain('zTE');
      expect(html).not.toContain('zPT');
      expect(html).not.toContain('zScore');
      expect(html).not.toContain('z-score');
    });

    it('renders empty state when caregiver has no registered children', () => {
      mocks.childrenHookState = {
        ...mocks.childrenHookState,
        status: 'empty',
        children: [],
      };

      const html = renderToString(React.createElement(CaregiverHomeScreen));

      expect(html).toContain('No tienes niños registrados');
      expect(html).toContain('Agregar niño');
    });
  });

  describe('AddChildScreen («Registrar niño»)', () => {
    it('renders child registration form fields and legal representative check', () => {
      const html = renderToString(React.createElement(AddChildScreen));

      expect(html).toContain('Registrar niño');
      expect(html).toContain('Nombre');
      expect(html).toContain('Apellido');
      expect(html).toContain('Fecha de nacimiento');
      expect(html).toContain('Sexo biológico');
      expect(html).toContain('Niño');
      expect(html).toContain('Niña');
      expect(html).toContain('Tu parentesco con el niño/a');
      expect(html).toContain('representante legal');
      expect(html).toContain('Guardar niño');
    });

    it('submits form with valid child data, calls createChild and navigates to Home', async () => {
      const mockChild = {
        id: '11111111-1111-4111-8111-111111111111',
        firstName: 'Mateo',
        lastName: 'Gómez',
        birthDate: '2023-06-15',
        sex: 'MALE' as const,
      };
      vi.spyOn(childrenApi, 'createChild').mockResolvedValueOnce(mockChild);

      let submitForm: (() => Promise<void>) | undefined;

      renderToString(
        React.createElement<AddChildScreenProps>(AddChildScreen, {
          initialValues: {
            firstName: 'Mateo',
            lastName: 'Gómez',
            birthDay: '15',
            birthMonth: '06',
            birthYear: '2023',
            sex: 'MALE',
            relationship: 'Padre',
            isLegalRepresentative: true,
          },
          onSubmitForTest: (fn: () => Promise<void>) => {
            submitForm = fn;
          },
        }),
      );

      expect(submitForm).toBeDefined();
      await submitForm!();

      expect(childrenApi.createChild).toHaveBeenCalledWith({
        firstName: 'Mateo',
        lastName: 'Gómez',
        birthDate: '2023-06-15',
        sex: 'MALE',
        relationship: 'Padre',
        isLegalRepresentative: true,
        consentTextVersion: CURRENT_CONSENT_VERSION,
      });

      expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.HOME);
    });
  });
});
