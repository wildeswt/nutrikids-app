import type { ChildResponse } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type * as ReactNative from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactNative>();
  return {
    ...actual,
    Modal: (props: { visible?: boolean; children?: React.ReactNode; testID?: string }) =>
      props.visible
        ? React.createElement(
            'mock-modal',
            { testID: props.testID, visible: props.visible },
            props.children,
          )
        : null,
  };
});

import { SelectChildModal } from '../components/SelectChildModal.js';

const MATEO: ChildResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo José',
  lastName: 'Rodríguez',
  birthDate: '2023-05-10',
  sex: 'MALE',
};

const VALENTINA: ChildResponse = {
  id: '22222222-2222-4222-8222-222222222222',
  firstName: 'Valentina',
  lastName: 'Gómez',
  birthDate: '2025-03-01',
  sex: 'FEMALE',
};

describe('SelectChildModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children with names, search input and handles selection', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const html = renderToString(
      <SelectChildModal
        visible={true}
        childrenList={[MATEO, VALENTINA]}
        selectedChildId={MATEO.id}
        onSelect={onSelect}
        onClose={onClose}
        isProfessional={true}
      />,
    );

    expect(html).toContain('Seleccionar paciente');
    expect(html).toContain('Mateo José Rodríguez');
    expect(html).toContain('Valentina Gómez');
    expect(html).toContain('Actual');
  });

  it('does not render content when visible is false', () => {
    const html = renderToString(
      <SelectChildModal
        visible={false}
        childrenList={[MATEO, VALENTINA]}
        selectedChildId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).not.toContain('Mateo José Rodríguez');
  });
});
