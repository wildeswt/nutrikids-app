import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockBack = vi.fn();
let mockSearchParams: Record<string, string | undefined> = {};

vi.mock('expo-router', () => ({
  Link: (props: { href: string; children: React.ReactNode }) =>
    React.createElement('mock-link', { href: props.href }, props.children),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
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

const mockConsentData = {
  id: 'a0000000-0000-0000-0000-000000000001',
  childId: 'c0000000-0000-0000-0000-000000000001',
  grantedById: 'u0000000-0000-0000-0000-000000000001',
  textVersion: 'v1',
  grantedAt: '2026-11-12T15:00:00.000Z',
  revokedAt: null,
};

let mockHookState = {
  status: 'idle' as const,
  consent: null as typeof mockConsentData | null,
  error: null as string | null,
  load: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
};

vi.mock('../hooks/useConsent.js', () => ({
  useConsent: () => mockHookState,
}));

vi.mock('../lib/consent-api.js', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/consent-api.js')>('../lib/consent-api.js');
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = {};
    mockHookState = {
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

      expect(html).toContain('¡Hola, María!');
      expect(html).toContain('+ Registrar nuevo niño');
      expect(html).toContain(
        'Antes de ingresar los datos del niño, te solicitaremos la lectura y aceptación del consentimiento informado',
      );
    });
  });

  describe('ConsentScreen', () => {
    it('muestra el texto del consentimiento en lenguaje claro y botón de aceptar en modo pre-registro', () => {
      mockSearchParams = { mode: 'register' };
      const html = renderToString(React.createElement(ConsentScreen));

      // Título y encabezados
      expect(html).toContain('Consentimiento Informado');
      expect(html).toContain('Términos y condiciones para el registro del niño');

      // Texto en lenguaje claro
      expect(html).toContain('DECLARACIÓN DE CONSENTIMIENTO INFORMADO');
      expect(html).toContain('Organización Mundial de la Salud (OMS)');
      expect(html).toContain('Confidencialidad y Seguridad');
      expect(html).toContain('Derecho de Revocación');

      // Botón de aceptar consentimiento
      expect(html).toContain('Aceptar consentimiento');
    });

    it('muestra versión del texto aceptado y fecha en modo vista con opción de revocar', () => {
      mockSearchParams = {
        childId: 'c0000000-0000-0000-0000-000000000001',
        childName: 'Sofía Morales',
        mode: 'view',
      };
      mockHookState = {
        ...mockHookState,
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
      mockSearchParams = {
        childId: 'c0000000-0000-0000-0000-000000000001',
        childName: 'Sofía Morales',
        mode: 'view',
      };
      mockHookState = {
        ...mockHookState,
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
      mockHookState = {
        ...mockHookState,
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

      expect(html).toContain('Sofía Morales');
      expect(html).toContain('VIGENTE');
      expect(html).toContain('Versión aceptada:');
      expect(html).toContain('v1');
      expect(html).toContain('Fecha:');
      expect(html).toContain('Revocar');
      expect(html).toContain('Ver documento');
    });
  });
});
