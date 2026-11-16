import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCreateCheckupInput, calculateLocalWhoResults } from '../lib/checkup-form.js';
import { parseCheckupSavedParams, toCheckupSavedParams } from '../lib/checkup-route.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const MATEO = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

const VALENTINA = {
  id: '44444444-4444-4444-8444-444444444444',
  firstName: 'Valentina',
  lastName: 'Ríos',
  birthDate: '2024-02-10',
  sex: 'FEMALE' as const,
};

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  routerBack: vi.fn(),
  createCheckup: vi.fn(),
  searchParams: {} as Record<string, string>,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    replace: mocks.routerReplace,
    back: mocks.routerBack,
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => mocks.searchParams,
  useFocusEffect: vi.fn(),
  useNavigation: () => ({ setParams: vi.fn() }),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('@react-native-community/datetimepicker', () => ({
  default: (props: Record<string, unknown>) => React.createElement('mock-date-picker', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', props),
}));

vi.mock('../components/KeyboardAwareScrollView.js', () => ({
  KeyboardAwareScrollView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-keyboard-scroll', props),
  KeyboardAwareTextInput: (props: Record<string, unknown>) =>
    React.createElement('mock-text-input', props),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({
    status: 'ready' as const,
    children: [MATEO, VALENTINA],
    error: null,
    loadError: null,
    load: vi.fn(),
  }),
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: () => ({
    status: 'ready' as const,
    checkups: [],
    saving: false,
    create: mocks.createCheckup,
    load: vi.fn(),
  }),
}));

import '../i18n/index.js';
import AddCheckupScreen from '../app/(caregiver)/add-checkup.js';
import CheckupSavedScreen from '../app/(caregiver)/checkup-saved.js';
import ProfessionalAddCheckupScreen from '../app/(professional)/add-checkup.js';

describe('Figura 6b — Formulario de control OMS (RF-04, RF-05)', () => {
  beforeEach(() => {
    mocks.routerPush.mockReset();
    mocks.routerReplace.mockReset();
    mocks.routerBack.mockReset();
    mocks.createCheckup.mockReset();
    mocks.searchParams = {};
  });

  it('muestra la unidad junto a cada campo (kg y cm) y el botón Guardar y calcular para cuidador y enfermería', () => {
    const caregiverHtml = renderToString(React.createElement(AddCheckupScreen));
    expect(caregiverHtml).toContain('Anotar un nuevo control');
    expect(caregiverHtml).toContain('Cambiar de niño');
    expect(caregiverHtml).toContain('kg');
    expect(caregiverHtml).toContain('cm');
    expect(caregiverHtml).toContain('Guardar y calcular');

    const nursingHtml = renderToString(React.createElement(ProfessionalAddCheckupScreen));
    expect(nursingHtml).toContain('Registrar control antropométrico');
    expect(nursingHtml).toContain('Cambiar de paciente');
    expect(nursingHtml).toContain('kg');
    expect(nursingHtml).toContain('cm');
    expect(nursingHtml).toContain('Guardar y calcular');
  });

  it('pide confirmación ante un valor atípico antes de guardar y genera el UUID en el celular', () => {
    const now = new Date(2026, 10, 14, 12, 0, 0);
    const atypicalForm = {
      dateText: '14/11/2026',
      weightText: '35',
      heightText: '96',
      position: 'STANDING' as const,
      notesText: 'Verificado con segunda balanza',
    };

    const firstAttempt = buildCreateCheckupInput(atypicalForm, {
      birthDate: MATEO.birthDate,
      sex: MATEO.sex,
      confirmOutlier: false,
      now,
    });
    expect(firstAttempt).toEqual({ ok: false, error: { code: 'outlier' } });

    const confirmedAttempt = buildCreateCheckupInput(atypicalForm, {
      birthDate: MATEO.birthDate,
      sex: MATEO.sex,
      confirmOutlier: true,
      now,
    });
    expect(confirmedAttempt.ok).toBe(true);
    if (!confirmedAttempt.ok) return;

    expect(confirmedAttempt.input.id).toMatch(UUID_V4);
    expect(confirmedAttempt.input.confirmOutlier).toBe(true);
  });

  it('calcula localmente con who-growth y muestra el resultado diferenciado para cuidador y enfermería', () => {
    const evaluation = calculateLocalWhoResults({
      sex: MATEO.sex,
      birthDate: MATEO.birthDate,
      measuredAt: '2026-11-14T12:00:00.000Z',
      weightKg: 14.5,
      lengthHeightCm: 96.0,
      position: 'STANDING',
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.results).toHaveLength(4);

    const checkupStub = {
      measuredAt: '2026-11-14T12:00:00.000Z',
      weightKg: 14.5,
      lengthHeightCm: 96.0,
      position: 'STANDING' as const,
    };

    // Vista Cuidador: lenguaje llano sin puntajes z ni clasificaciones técnicas
    mocks.searchParams = toCheckupSavedParams(MATEO, checkupStub, {
      localEvaluation: evaluation,
      roleMode: 'CAREGIVER',
    });
    const parsedCaregiver = parseCheckupSavedParams(mocks.searchParams);
    expect(parsedCaregiver?.localEvaluation?.results).toHaveLength(4);

    const caregiverSavedHtml = renderToString(React.createElement(CheckupSavedScreen));
    expect(caregiverSavedHtml).toContain('Resultado calculado (OMS)');
    expect(caregiverSavedHtml).toContain('dentro del rango esperado');
    expect(caregiverSavedHtml).not.toContain('z =');

    // Vista Enfermería / Profesional: muestra puntajes z, percentiles y clasificación OMS
    mocks.searchParams = toCheckupSavedParams(MATEO, checkupStub, {
      localEvaluation: evaluation,
      roleMode: 'PROFESSIONAL',
    });
    const nursingSavedHtml = renderToString(React.createElement(CheckupSavedScreen));
    expect(nursingSavedHtml).toContain('Cálculo local (who-growth)');
    expect(nursingSavedHtml).toContain('Peso para la edad');
    expect(nursingSavedHtml).toContain('Peso para la talla');
    expect(nursingSavedHtml).toContain('z =');
  });
});
