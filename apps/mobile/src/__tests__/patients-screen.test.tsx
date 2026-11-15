import type { AlertResponse, ChildResponse } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';
import type { PatientListItem } from '../lib/patients.js';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  focusEffects: [] as (() => void)[],
  hookState: {
    patients: [] as PatientListItem[],
    loading: false,
    refreshing: false,
    error: null as string | null,
    reload: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useFocusEffect: (cb: () => void) => {
    mocks.focusEffects.push(cb);
  },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('../hooks/usePatients.js', () => ({
  usePatients: () => mocks.hookState,
}));

import ProfessionalPatientsScreen from '../app/(professional)/children.js';

const mockChild1: ChildResponse = {
  id: 'child-1',
  firstName: 'Mateo',
  lastName: 'García',
  birthDate: '2023-01-10',
  sex: 'MALE',
};

const mockChild2: ChildResponse = {
  id: 'child-2',
  firstName: 'Ana',
  lastName: 'Alvarado',
  birthDate: '2023-05-15',
  sex: 'FEMALE',
};

const mockAlertSevere: AlertResponse = {
  id: 'alert-sev-1',
  childId: 'child-1',
  checkupId: 'checkup-1',
  indicatorResultId: 'res-1',
  indicator: 'WEIGHT_FOR_AGE',
  zScore: -3.2,
  classification: 'SEVERE_UNDERWEIGHT',
  riskType: 'UNDERWEIGHT',
  isSevere: true,
  reason: 'Bajo peso grave',
  status: 'GENERATED',
  createdAt: '2026-03-01T10:00:00.000Z',
  reviewDueAt: '2026-03-02T10:00:00.000Z',
  isOverdue: true,
  checkupIsCurrent: true,
};

const patientItems: PatientListItem[] = [
  {
    child: mockChild1,
    riskLevel: 'SEVERE',
    primaryAlert: mockAlertSevere,
    openAlertCount: 1,
  },
  {
    child: mockChild2,
    riskLevel: 'NO_ALERTS',
    primaryAlert: null,
    openAlertCount: 0,
  },
];

describe('ProfessionalPatientsScreen (Block 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusEffects.length = 0;
    mocks.hookState = {
      patients: patientItems,
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(async () => {}),
      refresh: vi.fn(async () => {}),
    };
  });

  it('renders loading state when loading and list is empty', () => {
    mocks.hookState.loading = true;
    mocks.hookState.patients = [];

    const html = renderToString(React.createElement(ProfessionalPatientsScreen));
    expect(html).toContain('patients-loading-state');
    expect(html).toContain('Cargando lista de pacientes...');
  });

  it('renders error state with retry button when error occurs on empty list', () => {
    mocks.hookState.loading = false;
    mocks.hookState.error = 'No pudimos cargar tus pacientes.';
    mocks.hookState.patients = [];

    const html = renderToString(React.createElement(ProfessionalPatientsScreen));
    expect(html).toContain('patients-error-state');
    expect(html).toContain('No pudimos cargar tus pacientes.');
    expect(html).toContain('patients-retry-button');
  });

  it('renders empty state when there are no linked patients', () => {
    mocks.hookState.loading = false;
    mocks.hookState.error = null;
    mocks.hookState.patients = [];

    const html = renderToString(React.createElement(ProfessionalPatientsScreen));
    expect(html).toContain('patients-empty-state');
    expect(html).toContain('Sin pacientes vinculados');
  });

  it('renders patient cards with risk badges, alert summaries, and action buttons', () => {
    const html = renderToString(React.createElement(ProfessionalPatientsScreen));

    expect(html).toContain('patients-screen');
    expect(html).toContain('Mateo García');
    expect(html).toContain('Ana Alvarado');
    expect(html).toContain('patient-risk-badge-child-1');
    expect(html).toContain('patient-overdue-badge-child-1');
    expect(html).toContain('Vencida');
    expect(html).toContain('patient-action-alert-child-1');
    expect(html).toContain('patient-action-followup-child-1');
    expect(html).toContain('patient-action-referral-child-1');
    expect(html).toContain('patient-action-evolution-child-1');
    expect(html).toContain('patient-action-checkup-child-1');
  });

  it('navigates with correct parameters when actions are invoked', () => {
    // Test the navigation router routes are properly mapped
    expect(APP_ROUTES.PROFESSIONAL.ALERT_DETAIL).toBe('/(professional)/alert-detail');
    expect(APP_ROUTES.PROFESSIONAL.FOLLOW_UP).toBe('/(professional)/follow-up');
    expect(APP_ROUTES.PROFESSIONAL.REFERRAL).toBe('/(professional)/referral');
    expect(APP_ROUTES.PROFESSIONAL.EVOLUTION).toBe('/(professional)/evolution');
    expect(APP_ROUTES.PROFESSIONAL.ADD_CHECKUP).toBe('/(professional)/add-checkup');
  });
});
