import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));
vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));
vi.mock('../components/ChildGrowthStatus.js', () => ({ ChildGrowthStatus: () => null }));

import { CaregiverChildCard } from '../components/CaregiverChildCard.js';

const child = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Rodríguez',
  birthDate: '2023-06-05',
  sex: 'MALE' as const,
};

const assignment = (id: string, firstName: string, lastName: string) => ({
  id,
  childId: child.id,
  professionalId: id,
  specialty: 'nutrition',
  firstName,
  lastName,
  startDate: '2026-11-01',
  endDate: null,
});

describe('CaregiverChildCard — acceso a profesionales', () => {
  it('sin onLinkProfessional no muestra ningún acceso (uso anterior)', () => {
    const html = renderToString(
      React.createElement(CaregiverChildCard, { child, onPress: () => {} }),
    );
    expect(html).not.toContain('Vincular profesional');
  });

  it('sin profesional ofrece «+ Vincular profesional»', () => {
    const html = renderToString(
      React.createElement(CaregiverChildCard, {
        child,
        onPress: () => {},
        professionals: [],
        onLinkProfessional: () => {},
      }),
    );
    expect(html).toContain('Vincular profesional');
    expect(html).toContain(`child-card-${child.id}-link-professional`);
  });

  it('con profesional muestra iniciales, nombre y «Nutrición · Profesional vinculado»', () => {
    const html = renderToString(
      React.createElement(CaregiverChildCard, {
        child,
        onPress: () => {},
        professionals: [assignment('22222222-2222-4222-8222-222222222222', 'Laura', 'Pérez')],
        onLinkProfessional: () => {},
        onOpenProfessionals: () => {},
      }),
    );
    expect(html).toContain('LP');
    expect(html).toContain('Laura Pérez');
    expect(html).toContain('Nutrición · Profesional vinculado');
    expect(html).not.toContain(`child-card-${child.id}-link-professional`);
  });

  it('con varios profesionales indica cuántos más hay', () => {
    const html = renderToString(
      React.createElement(CaregiverChildCard, {
        child,
        onPress: () => {},
        professionals: [
          assignment('22222222-2222-4222-8222-222222222222', 'Laura', 'Pérez'),
          assignment('33333333-3333-4333-8333-333333333333', 'Ana', 'Gil'),
        ],
        onLinkProfessional: () => {},
      }),
    );
    expect(html).toContain('y 1 más');
  });
});
