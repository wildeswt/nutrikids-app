import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-ionicons', props),
}));

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
    Modal: ({
      visible,
      children,
      ...rest
    }: {
      visible?: boolean;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => (visible ? React.createElement('mock-modal', rest, children) : null),
  };
});

interface ElementWithProps {
  props?: {
    testID?: string;
    children?: unknown;
    disabled?: boolean;
    onPress?: () => void;
    [key: string]: unknown;
  };
}

function findByTestId(node: unknown, testID: string): ElementWithProps | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as ElementWithProps;
  if (obj.props?.testID === testID) return obj;
  const children = obj.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findByTestId(child, testID);
      if (match) return match;
    }
  } else if (children && typeof children === 'object') {
    return findByTestId(children, testID);
  }
  return null;
}

describe('ConfirmDialog', () => {
  it('no renderiza contenido cuando visible es false', () => {
    const html = renderToString(
      React.createElement(ConfirmDialog, {
        visible: false,
        title: '¿Confirmar acción?',
        onCancel: vi.fn(),
      }),
    );
    expect(html).toBe('');
  });

  it('renderiza título, mensaje, badge y botón de confirmación cuando visible es true', () => {
    let tree: unknown = null;
    function Capture() {
      tree = ConfirmDialog({
        visible: true,
        title: '¿Desvincular a Si Si?',
        message: 'Si Si dejará de ver los controles y alertas de Samuel.',
        confirmLabel: 'Desvincular',
        tone: 'danger',
        icon: 'person-remove-outline',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      return tree as React.ReactElement;
    }
    const html = renderToString(React.createElement(Capture));

    expect(html).toContain('¿Desvincular a Si Si?');
    expect(html).toContain('Si Si dejará de ver los controles y alertas de Samuel.');
    expect(html).toContain('Desvincular');

    const badge = findByTestId(tree, 'confirm-dialog-badge');
    expect(badge).not.toBeNull();
    const closeBtn = findByTestId(tree, 'confirm-dialog-close');
    expect(closeBtn).not.toBeNull();
    const confirmBtn = findByTestId(tree, 'confirm-dialog-confirm-btn');
    expect(confirmBtn).not.toBeNull();
  });

  it('ejecuta onConfirm al presionar el botón de confirmación', () => {
    const onConfirm = vi.fn();
    let tree: unknown = null;
    function Capture() {
      tree = ConfirmDialog({
        visible: true,
        title: 'Confirmar',
        confirmLabel: 'Aceptar',
        onConfirm,
        onCancel: vi.fn(),
      });
      return tree as React.ReactElement;
    }
    renderToString(React.createElement(Capture));

    const confirmBtn = findByTestId(tree, 'confirm-dialog-confirm-btn');
    confirmBtn?.props?.onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ejecuta onCancel al presionar el botón de cierre (X)', () => {
    const onCancel = vi.fn();
    let tree: unknown = null;
    function Capture() {
      tree = ConfirmDialog({
        visible: true,
        title: 'Confirmar',
        confirmLabel: 'Aceptar',
        onConfirm: vi.fn(),
        onCancel,
      });
      return tree as React.ReactElement;
    }
    renderToString(React.createElement(Capture));

    const closeBtn = findByTestId(tree, 'confirm-dialog-close');
    closeBtn?.props?.onPress?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renderiza botón cancelar cuando se pasa cancelLabel y llama onCancel al pulsarlo', () => {
    const onCancel = vi.fn();
    let tree: unknown = null;
    function Capture() {
      tree = ConfirmDialog({
        visible: true,
        title: 'Confirmar',
        confirmLabel: 'Aceptar',
        cancelLabel: 'Cancelar',
        onConfirm: vi.fn(),
        onCancel,
      });
      return tree as React.ReactElement;
    }
    const html = renderToString(React.createElement(Capture));
    expect(html).toContain('Cancelar');

    const cancelBtn = findByTestId(tree, 'confirm-dialog-cancel-btn');
    expect(cancelBtn).not.toBeNull();
    cancelBtn?.props?.onPress?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('deshabilita botones y muestra estado de carga cuando loading es true', () => {
    let tree: unknown = null;
    function Capture() {
      tree = ConfirmDialog({
        visible: true,
        title: 'Borrando...',
        confirmLabel: 'Borrar',
        cancelLabel: 'Cancelar',
        loading: true,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      return tree as React.ReactElement;
    }
    renderToString(React.createElement(Capture));

    const confirmBtn = findByTestId(tree, 'confirm-dialog-confirm-btn');
    expect(confirmBtn?.props?.disabled).toBe(true);

    const cancelBtn = findByTestId(tree, 'confirm-dialog-cancel-btn');
    expect(cancelBtn?.props?.disabled).toBe(true);

    const closeBtn = findByTestId(tree, 'confirm-dialog-close');
    expect(closeBtn?.props?.disabled).toBe(true);
  });
});
