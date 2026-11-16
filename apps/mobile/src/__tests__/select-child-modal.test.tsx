import type { ChildResponse } from '@nutrikids/shared';
import React from 'react';
import type * as ReactTypes from 'react';
import { renderToString } from 'react-dom/server';
import type * as ReactNative from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookStore = vi.hoisted(() => ({
  enabled: false,
  states: [] as unknown[],
  cursor: 0,
  reset() {
    this.enabled = false;
    this.states = [];
    this.cursor = 0;
  },
  rewind() {
    this.cursor = 0;
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      if (!hookStore.enabled) {
        return actual.useState(initial);
      }
      const idx = hookStore.cursor++;
      if (!(idx in hookStore.states)) {
        hookStore.states[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (updater: T | ((prev: T) => T)) => {
        const prev = hookStore.states[idx] as T;
        hookStore.states[idx] =
          typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
      };
      return [hookStore.states[idx] as T, setState] as const;
    },
  };
});

function renderTree(Component: () => unknown): { tree: React.ReactNode; html: string } {
  hookStore.rewind();
  let tree: React.ReactNode = null;
  function Capture() {
    tree = Component() as React.ReactNode;
    return tree as React.ReactElement;
  }
  const html = renderToString(React.createElement(Capture));
  return { tree, html };
}

function findElementByTestId(
  node: unknown,
  testID: string,
): React.ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findElementByTestId(item, testID);
      if (found) return found;
    }
    return null;
  }
  if (React.isValidElement<Record<string, unknown>>(node)) {
    if (node.props?.['testID'] === testID) return node;
    return findElementByTestId(node.props?.['children'], testID);
  }
  return null;
}

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
    hookStore.reset();
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

  it('filters children by search query (ignoring accents) and triggers onSelect / onClose', () => {
    hookStore.enabled = true;
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const props = {
      visible: true,
      childrenList: [MATEO, VALENTINA],
      selectedChildId: MATEO.id,
      onSelect,
      onClose,
      isProfessional: false,
    };

    const { tree: initialTree } = renderTree(() => SelectChildModal(props));
    const searchInput = findElementByTestId(initialTree, 'select-child-search-input');
    expect(searchInput).not.toBeNull();
    (searchInput?.props?.['onChangeText'] as (v: string) => void)('gomez');

    const { tree: filteredTree, html: filteredHtml } = renderTree(() => SelectChildModal(props));
    expect(filteredHtml).toContain('Valentina Gómez');
    expect(filteredHtml).not.toContain('Mateo José Rodríguez');

    const valentinaRow = findElementByTestId(filteredTree, `select-child-item-${VALENTINA.id}`);
    expect(valentinaRow).not.toBeNull();
    (valentinaRow?.props?.['onPress'] as () => void)();
    expect(onSelect).toHaveBeenCalledWith(VALENTINA);

    const { tree: treeAfterSelect } = renderTree(() => SelectChildModal(props));
    const searchAfterSelect = findElementByTestId(treeAfterSelect, 'select-child-search-input');
    (searchAfterSelect?.props?.['onChangeText'] as (v: string) => void)('inexistente');
    const { html: emptyHtml } = renderTree(() => SelectChildModal(props));
    expect(emptyHtml).toContain('select-child-empty');

    const { tree: treeForClose } = renderTree(() => SelectChildModal(props));
    const closeBtn = findElementByTestId(treeForClose, 'select-child-close');
    (closeBtn?.props?.['onPress'] as () => void)();
    expect(onClose).toHaveBeenCalled();
  });
});
