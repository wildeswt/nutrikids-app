import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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

describe('Auth Screens Rendering', () => {
  describe('LoginScreen', () => {
    it('renders login screen elements matching Figure 5 requirements', () => {
      const html = renderToString(React.createElement(LoginScreen));

      // Brand headers
      expect(html).toContain('NutriKids');
      expect(html).toContain('Iniciar Sesión');

      // Form labels and placeholders
      expect(html).toContain('Correo electrónico');
      expect(html).toContain('Contraseña');
      expect(html).toContain('Olvidé mi contraseña');

      // Actions
      expect(html).toContain('Entrar');
      expect(html).toContain('Crear cuenta');
    });
  });

  describe('RegisterScreen', () => {
    it('renders registration screen with role selector and fields', () => {
      const html = renderToString(React.createElement(RegisterScreen));

      // Brand headers
      expect(html).toContain('NutriKids');
      expect(html).toContain('Crear Cuenta');

      // Role selector chips
      expect(html).toContain('Tipo de Perfil');
      expect(html).toContain('Cuidador');
      expect(html).toContain('Profesional de Salud');

      // Core fields
      expect(html).toContain('Nombre');
      expect(html).toContain('Apellido');
      expect(html).toContain('Correo electrónico');
      expect(html).toContain('Teléfono (opcional)');
      expect(html).toContain('Contraseña');
      expect(html).toContain('Confirmar Contraseña');

      // Submit and link back to login
      expect(html).toContain('Registrarme');
      expect(html).toContain('Iniciar sesión');
    });
  });

  describe('ForgotPasswordScreen', () => {
    it('renders recovery instructions, email input, and submit button', () => {
      const html = renderToString(React.createElement(ForgotPasswordScreen));

      expect(html).toContain('NutriKids');
      expect(html).toContain('Recuperar Contraseña');
      expect(html).toContain('Correo electrónico');
      expect(html).toContain('Enviar Instrucciones');
      expect(html).toContain('Volver al inicio de sesión');
    });
  });

  describe('ResetPasswordScreen', () => {
    it('renders token input, new password, confirm password, and submit button', () => {
      const html = renderToString(React.createElement(ResetPasswordScreen));

      expect(html).toContain('NutriKids');
      expect(html).toContain('Nueva Contraseña');
      expect(html).toContain('Token de recuperación');
      expect(html).toContain('Nueva contraseña');
      expect(html).toContain('Confirmar nueva contraseña');
      expect(html).toContain('Actualizar Contraseña');
      expect(html).toContain('Volver al inicio de sesión');
    });
  });
});
