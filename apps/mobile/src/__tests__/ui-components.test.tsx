import React from 'react';
import { renderToString } from 'react-dom/server';
import { Text, TextInput } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { Card } from '../components/ui/Card.js';
import { PillField } from '../components/ui/PillField.js';
import { PrimaryButton } from '../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../components/ui/ScreenHeader.js';
import { SecondaryButton } from '../components/ui/SecondaryButton.js';
import { PALETTE } from '../constants/colors.js';
import {
  BUTTON_HEIGHT,
  BUTTON_WIDTH,
  CARD_SHADOW,
  FIELD_HEIGHT,
  RADIUS_PILL,
  SCREEN_MARGIN,
} from '../constants/layout.js';
import { font } from '../constants/typography.js';

vi.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: async () => undefined,
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, size, color }: { name: string; size?: number; color?: string }) =>
    React.createElement('span', {
      'data-icon': name,
      'data-size': size,
      'data-color': color,
    }),
}));

describe('design tokens y helpers de UI', () => {
  it('expone la paleta y medidas alineadas con Figma', () => {
    expect(PALETTE.background).toBe('#FBFBFB');
    expect(PALETTE.surface).toBe('#FBFBFB');
    expect(PALETTE.input.background).toBe('#F9F9F9');
    expect(PALETTE.input.placeholder).toBe('#969696');
    expect(PALETTE.feedback.error).toBe('#E14100');
    expect(PALETTE.border.input).toBe('#E5E5E5');
    expect(PALETTE.border.checkbox).toBe('#D4D4D8');

    expect(SCREEN_MARGIN).toBe(30);
    expect(RADIUS_PILL).toBe(25);
    expect(FIELD_HEIGHT).toBe(50);
    expect(BUTTON_WIDTH).toBe(318);
    expect(BUTTON_HEIGHT).toBe(50);
    expect(CARD_SHADOW).toEqual({
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    });
  });

  it('mapea los pesos tipograficos de Inter', () => {
    expect(font('regular')).toBe('Inter_400Regular');
    expect(font('medium')).toBe('Inter_500Medium');
    expect(font('semibold')).toBe('Inter_600SemiBold');
  });
});

describe('ScreenHeader', () => {
  it('renderiza titulo y boton de retorno por defecto', () => {
    const html = renderToString(
      React.createElement(ScreenHeader, {
        title: 'Nuevo control',
        onBack: () => undefined,
        testID: 'header-test',
      }),
    );

    expect(html).toContain('Nuevo control');
    expect(html).toContain('Volver');
    expect(html).toContain('arrow-back');
    expect(html).toContain('header-test');
    expect(html).toContain('header-test-back');
    expect(html).toContain('role="button"');
    expect(html).toContain('role="heading"');
  });

  it('oculta el boton de retorno cuando showBack es false', () => {
    const html = renderToString(
      React.createElement(ScreenHeader, {
        title: 'Inicio',
        showBack: false,
        testID: 'header-no-back',
      }),
    );

    expect(html).toContain('Inicio');
    expect(html).not.toContain('Volver');
    expect(html).not.toContain('header-no-back-back');
  });
});

describe('PillField', () => {
  it('renderiza etiqueta, TextInput, icono derecho y error', () => {
    const html = renderToString(
      <PillField
        label="Nombre"
        error="Campo requerido"
        rightIcon={<Text>OK</Text>}
        testID="name-field"
        accessibilityRole="none"
      >
        <TextInput placeholder="Escribe aqui" />
      </PillField>,
    );

    expect(html).toContain('Nombre');
    expect(html).toContain('Escribe aqui');
    expect(html).toContain('OK');
    expect(html).toContain('Campo requerido');
    expect(html).toContain('name-field');
    expect(html).toContain('role="alert"');
  });

  it('admite contenido de selector sin mensaje de error', () => {
    const html = renderToString(
      <PillField label="Sexo" testID="sex-field">
        <Text>Femenino</Text>
      </PillField>,
    );

    expect(html).toContain('Sexo');
    expect(html).toContain('Femenino');
    expect(html).not.toContain('sex-field-error');
  });
});

describe('PrimaryButton y SecondaryButton', () => {
  it('renderiza PrimaryButton normal, cargando y deshabilitado', () => {
    const normalHtml = renderToString(
      React.createElement(PrimaryButton, {
        label: 'Guardar',
        onPress: () => undefined,
        testID: 'save-btn',
      }),
    );
    expect(normalHtml).toContain('Guardar');
    expect(normalHtml).toContain('role="button"');
    expect(normalHtml).toContain('save-btn');

    const loadingHtml = renderToString(
      React.createElement(PrimaryButton, {
        label: 'Guardar',
        loading: true,
        testID: 'save-btn-loading',
      }),
    );
    expect(loadingHtml).toContain('role="progressbar"');
    expect(loadingHtml).toContain('save-btn-loading-loading');
    expect(loadingHtml).toContain('aria-disabled="true"');

    const disabledHtml = renderToString(
      React.createElement(PrimaryButton, {
        label: 'Guardar',
        disabled: true,
        testID: 'save-btn-disabled',
      }),
    );
    expect(disabledHtml).toContain('aria-disabled="true"');
  });

  it('renderiza SecondaryButton normal, cargando y deshabilitado', () => {
    const normalHtml = renderToString(
      React.createElement(SecondaryButton, {
        label: 'Cancelar',
        onPress: () => undefined,
        testID: 'cancel-btn',
      }),
    );
    expect(normalHtml).toContain('Cancelar');
    expect(normalHtml).toContain('role="button"');
    expect(normalHtml).toContain('cancel-btn');

    const loadingHtml = renderToString(
      React.createElement(SecondaryButton, {
        label: 'Cancelar',
        loading: true,
        testID: 'cancel-btn-loading',
      }),
    );
    expect(loadingHtml).toContain('role="progressbar"');
    expect(loadingHtml).toContain('aria-disabled="true"');
  });
});

describe('Card', () => {
  it('renderiza contenido hijo y testID configurable', () => {
    const html = renderToString(
      <Card testID="summary-card" accessibilityRole="summary">
        <Text>Contenido de tarjeta</Text>
      </Card>,
    );

    expect(html).toContain('Contenido de tarjeta');
    expect(html).toContain('summary-card');
  });
});
