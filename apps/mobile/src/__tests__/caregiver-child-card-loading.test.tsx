import type { ChildResponse } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CaregiverChildCard } from '../components/CaregiverChildCard.js';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-ionicons', props),
}));

const child = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Demo',
  birthDate: '2023-06-10',
  sex: 'MALE',
} as ChildResponse;

const render = (professionalsLoading: boolean) =>
  renderToString(
    React.createElement(CaregiverChildCard, {
      child,
      onPress: () => {},
      onLinkProfessional: () => {},
      professionalsLoading,
      testID: 'card',
    }),
  );

describe('CaregiverChildCard professional row', () => {
  it('shows a loading row, not «Vincular profesional», while the professional is being read', () => {
    const html = render(true);

    expect(html).toContain('card-professional-loading');
    expect(html).not.toContain('card-link-professional');
  });

  it('offers «Vincular profesional» once it is known there is none', () => {
    const html = render(false);

    expect(html).toContain('card-link-professional');
    expect(html).not.toContain('card-professional-loading');
  });
});
