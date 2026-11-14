import type { ConsentResponse } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';
import type { ConsentStatus } from '../hooks/useConsent.js';
import type * as ConsentApiModule from '../lib/consent-api.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  searchParams: {} as Record<string, string | undefined>,
  hookState: {
    status: 'idle' as ConsentStatus,
    consent: null as ConsentResponse | null,
    error: null as string | null,
    load: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
  },
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
  Link: (props: { href: string; children: React.ReactNode }) =>
    React.createElement('mock-link', { href: props.href }, props.children),
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
  }),
  useLocalSearchParams: () => mocks.searchParams,
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
      firstName: 'María',
      lastName: 'González',
      email: 'maria@example.com',
      roles: ['CAREGIVER'],
    },
    activeRole: 'CAREGIVER',
    switchRole: vi.fn(),
    signOut: vi.fn(),
    status: 'authenticated',
  }),
}));

vi.mock('../hooks/useConsent.js', () => ({
  useConsent: () => mocks.hookState,
}));

vi.mock('../lib/consent-api.js', async () => {
  const actual = await vi.importActual<typeof ConsentApiModule>('../lib/consent-api.js');
  return {
    ...actual,
    fetchCaregiverChildren: vi.fn().mockResolvedValue([
      {
        id: 'c0000000-0000-0000-0000-000000000001',
        firstName: 'Sofía',
        lastName: 'Morales',
        birthDate: '2024-05-10',
        sex: 'FEMALE',
      },
    ]),
  };
});

import ConsentScreen from '../app/(caregiver)/consent.js';
import CaregiverHomeScreen from '../app/(caregiver)/index.js';
import CaregiverProfileScreen, { ConsentChildItem } from '../app/(caregiver)/profile.js';

describe('Consent Screens & Components Rendering (NK-20)', () => {
  const mockConsentData: ConsentResponse = {
    id: 'a0000000-0000-0000-0000-000000000001',
    childId: 'c0000000-0000-0000-0000-000000000001',
    grantedById: 'u0000000-0000-0000-0000-000000000001',
    textVersion: 'v1',
    grantedAt: '2026-11-12T15:00:00.000Z',
    revokedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = {};
    mocks.hookState = {
      status: 'idle',
      consent: null,
      error: null,
      load: vi.fn(),
      grant: vi.fn(),
      revoke: vi.fn(),
    };
  });

  describe('CaregiverHomeScreen - Flujo Pre-Registro', () => {
    it('muestra aviso y acción para aceptar consentimiento antes de registrar datos del niño', () => {
      const html = renderToString(React.createElement(CaregiverHomeScreen));

      expect(html).toContain('María');
      expect(html).toContain('+ Registrar nuevo niño');
      expect(html).toContain(
        'Antes de ingresar los datos del niño, te solicitaremos la lectura y aceptación del consentimiento informado',
      );
    });
  });

  describe('ConsentScreen', () => {
    it('muestra el texto del consentimiento en lenguaje claro y botón de aceptar en modo pre-registro', () => {
      mocks.searchParams = { mode: 'register' };
      const html = renderToString(React.createElement(ConsentScreen));

      // Título y encabezados
      expect(html).toContain('Consentimiento');
      expect(html).toContain('Antes de registrar a tu hijo o hija necesitamos tu autorización');

      // Resumen en lenguaje claro: ¿Qué autorizas?
      expect(html).toContain('¿Qué autorizas?');
      expect(html).toContain('Guardar el peso, la talla y la alimentación');
      expect(html).toContain('estándares de la OMS');
      expect(html).toContain('equipo de salud asignado');

      // El texto completo está disponible de forma desplegable
      expect(html).toContain('Leer el texto completo');
      expect(html).not.toContain('Versión v1 del texto');

      // Confirmaciones y acciones del representante legal
      expect(html).toContain('Soy el representante legal');
      expect(html).toContain('Entiendo que puedo revocar este consentimiento');
      expect(html).toContain('Acepto y continuar');
      expect(html).toContain('Ahora no');
    });

    it('accepting consent without childId displays alert and clicking "Continuar al registro" redirects to ADD_CHILD', async () => {
      mocks.searchParams = { mode: 'register' };
      const alertSpy = vi.spyOn(Alert, 'alert');

      interface ElementWithProps {
        props?: {
          testID?: string;
          children?: ElementWithProps | ElementWithProps[];
          [key: string]: unknown;
        };
      }

      function findElementByTestId(node: unknown, testId: string): ElementWithProps | null {
        if (!node || typeof node !== 'object') return null;
        const element = node as ElementWithProps;
        if (element.props?.testID === testId) return element;
        if (Array.isArray(element.props?.children)) {
          for (const child of element.props.children) {
            const found = findElementByTestId(child, testId);
            if (found) return found;
          }
        } else if (element.props?.children) {
          return findElementByTestId(element.props.children, testId);
        }
        return null;
      }

      let capturedTree: unknown = null;
      function TestWrapper() {
        capturedTree = ConsentScreen();
        return null;
      }

      renderToString(React.createElement(TestWrapper));

      const acceptButton = findElementByTestId(capturedTree, 'accept-consent-button');
      expect(acceptButton).toBeDefined();
      const onPress = acceptButton?.props?.['onPress'] as (() => void | Promise<void>) | undefined;
      await onPress?.();

      expect(alertSpy).toHaveBeenCalledWith(
        'Consentimiento aceptado',
        expect.stringContaining('v1'),
        expect.any(Array),
      );

      const buttons = alertSpy.mock.calls[0]?.[2] as Array<{ text: string; onPress?: () => void }>;
      expect(buttons).toBeDefined();
      const continueButton = buttons.find((b) => b.text === 'Continuar al registro');
      expect(continueButton).toBeDefined();

      continueButton?.onPress?.();
      expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.ADD_CHILD);
    });

    it('muestra versión del texto aceptado y fecha en modo vista con opción de revocar', () => {
      mocks.searchParams = {
        childId: 'c0000000-0000-0000-0000-000000000001',
        childName: 'Sofía Morales',
        mode: 'view',
      };
      mocks.hookState = {
        ...mocks.hookState,
        status: 'active',
        consent: mockConsentData,
      };

      const html = renderToString(React.createElement(ConsentScreen));

      // Debe mostrar la versión aceptada y la fecha
      expect(html).toContain('Versión aceptada:');
      expect(html).toContain('v1');
      expect(html).toContain('Fecha de otorgamiento:');
      expect(html).toContain('VIGENTE');

      // Opción de revocarlo
      expect(html).toContain('Revocar consentimiento');
    });

    it('muestra estado revocado y fecha de revocación cuando el consentimiento está inactivo', () => {
      mocks.searchParams = {
        childId: 'c0000000-0000-0000-0000-000000000001',
        childName: 'Sofía Morales',
        mode: 'view',
      };
      mocks.hookState = {
        ...mocks.hookState,
        status: 'revoked',
        consent: {
          ...mockConsentData,
          revokedAt: '2026-11-12T16:00:00.000Z',
        },
      };

      const html = renderToString(React.createElement(ConsentScreen));

      expect(html).toContain('REVOCADO');
      expect(html).toContain('Fecha de revocación:');
      expect(html).toContain('Otorgar consentimiento nuevamente');
    });
  });

  describe('CaregiverProfileScreen & ConsentChildItem', () => {
    it('muestra sección de Consentimientos Informados en el perfil', () => {
      const html = renderToString(React.createElement(CaregiverProfileScreen));

      expect(html).toContain('Mi Perfil');
      expect(html).toContain('Consentimientos Informados');
      expect(html).toContain(
        'Gestiona la autorización de tratamiento de datos y seguimiento nutricional de tus hijos/as.',
      );
    });

    it('ConsentChildItem muestra versión, fecha y botón de revocar en perfil', () => {
      mocks.hookState = {
        ...mocks.hookState,
        status: 'active',
        consent: mockConsentData,
      };

      const mockChild = {
        id: 'c0000000-0000-0000-0000-000000000001',
        firstName: 'Sofía',
        lastName: 'Morales',
        birthDate: '2024-05-10',
        sex: 'FEMALE' as const,
      };

      const html = renderToString(React.createElement(ConsentChildItem, { child: mockChild }));

      expect(html).toContain('Sofía');
      expect(html).toContain('Morales');
      expect(html).toContain('VIGENTE');
      expect(html).toContain('Versión aceptada:');
      expect(html).toContain('v1');
      expect(html).toContain('Fecha:');
      expect(html).toContain('Revocar');
      expect(html).toContain('Ver documento');
    });
  });
});
