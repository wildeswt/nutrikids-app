import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../constants/assets.js', () => ({
  APP_ASSETS: {
    LOGO: { uri: 'mock-logo.png' },
  },
}));

vi.mock('expo-router', () => ({
  Link: (props: { href: string; children: React.ReactNode }) =>
    React.createElement('mock-link', { href: props.href }, props.children),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useLocalSearchParams: () => ({ token: 'mock-recovery-token' }),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signOut: vi.fn(),
    session: null,
    status: 'idle',
  }),
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: 'http://localhost:3000',
      },
    },
  },
}));

import ForgotPasswordScreen from '../app/(auth)/forgot-password.js';
import LoginScreen from '../app/(auth)/login.js';
import RegisterScreen from '../app/(auth)/register.js';
import ResetPasswordScreen from '../app/(auth)/reset-password.js';
import SelectRoleScreen from '../app/(auth)/select-role.js';
import WelcomeScreen from '../app/(auth)/welcome.js';

describe('Auth Screens Rendering', () => {
  describe('WelcomeScreen', () => {
    it('renders welcome screen with logo, slogan and action buttons', () => {
      const html = renderToString(React.createElement(WelcomeScreen));

      expect(html).toContain('Cuidar su crecimiento, juntos.');
      expect(html).toContain('Iniciar Sesión');
      expect(html).toContain('Registrarse');
      expect(html).toContain('primary-button');
      expect(html).toContain('secondary-button');
    });
  });

  describe('SelectRoleScreen', () => {
    it('renders role selection screen with caregiver and professional options', () => {
      const html = renderToString(React.createElement(SelectRoleScreen));

      expect(html).toContain('Volver');
      expect(html).toContain('Cuidar su crecimiento, juntos.');
      expect(html).toContain('¿Con qué perfil deseas registrarte?');
      expect(html).toContain('Soy Cuidador');
      expect(html).toContain('Soy Profesional de Salud');
      expect(html).toContain('Iniciar Sesión');
    });
  });

  describe('LoginScreen', () => {
    it('renders login screen elements matching Figure 5 requirements', () => {
      const html = renderToString(React.createElement(LoginScreen));

      // Navigation and brand headers
      expect(html).toContain('Volver');
      expect(html).toContain('Cuidar su crecimiento, juntos.');
      expect(html).toContain('Iniciar Sesión');

      // Form labels and placeholders inside PillField
      expect(html).toContain('pill-field');
      expect(html).toContain('Correo Electrónico');
      expect(html).toContain('Contraseña');
      expect(html).toContain('¿Olvidó su contraseña?');

      // Actions
      expect(html).toContain('primary-button');
      expect(html).toContain('Iniciar Sesión');
      expect(html).toContain('Regístrate');
    });
  });

  describe('RegisterScreen', () => {
    it('renders registration screen with split Nombre and Apellido fields', () => {
      const html = renderToString(React.createElement(RegisterScreen));

      // Navigation and brand headers
      expect(html).toContain('Volver');
      expect(html).toContain('Cuidar su crecimiento, juntos.');
      expect(html).toContain('Crear Cuenta');
      expect(html).toContain('Cambiar perfil');

      // Core fields inside PillField
      expect(html).toContain('pill-field');
      expect(html).toContain('Nombre');
      expect(html).toContain('Apellido');
      expect(html).toContain('Correo Electrónico');
      expect(html).toContain('Contraseña');
      expect(html).toContain('Confirmar Contraseña');

      // Submit and link back to login
      expect(html).toContain('primary-button');
      expect(html).toContain('Crear Cuenta');
      expect(html).toContain('Iniciar Sesión');
    });
  });

  describe('ForgotPasswordScreen', () => {
    it('renders recovery instructions, email input, and submit button', () => {
      const html = renderToString(React.createElement(ForgotPasswordScreen));

      expect(html).toContain('Volver');
      expect(html).toContain('NutriKids');
      expect(html).toContain('Recuperar Contraseña');
      expect(html).toContain('pill-field');
      expect(html).toContain('Correo electrónico');
      expect(html).toContain('primary-button');
      expect(html).toContain('Enviar Instrucciones');
      expect(html).toContain('Volver al inicio de sesión');
    });
  });

  describe('ResetPasswordScreen', () => {
    it('renders token input, new password, confirm password, and submit button', () => {
      const html = renderToString(React.createElement(ResetPasswordScreen));

      expect(html).toContain('Volver');
      expect(html).toContain('NutriKids');
      expect(html).toContain('Nueva Contraseña');
      expect(html).toContain('pill-field');
      expect(html).toContain('Token de recuperación');
      expect(html).toContain('Nueva contraseña');
      expect(html).toContain('Confirmar nueva contraseña');
      expect(html).toContain('primary-button');
      expect(html).toContain('Actualizar Contraseña');
      expect(html).toContain('Volver al inicio de sesión');
    });
  });
});
