import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    flatten: <T,>(style: T): T => style,
  },
  View: ({
    children,
    testID,
    ...rest
  }: {
    children?: React.ReactNode;
    testID?: string;
    [key: string]: unknown;
  }) => React.createElement('div', { 'data-testid': testID, ...rest }, children),
  Text: ({
    children,
    testID,
    ...rest
  }: {
    children?: React.ReactNode;
    testID?: string;
    [key: string]: unknown;
  }) => React.createElement('span', { 'data-testid': testID, ...rest }, children),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    React.createElement('span', { 'data-icon': name }, name),
}));

import { OfflineDataNotice } from '../components/OfflineDataNotice';

describe('OfflineDataNotice', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');

  it('no renderiza nada cuando los datos están frescos o provienen de la red', () => {
    expect(
      renderToStaticMarkup(
        <OfflineDataNotice
          fromCache={false}
          stale={false}
          lastSyncedAt="2026-11-14T11:55:00.000Z"
        />,
      ),
    ).toBe('');

    expect(
      renderToStaticMarkup(
        <OfflineDataNotice fromCache stale={false} lastSyncedAt="2026-11-14T11:55:00.000Z" />,
      ),
    ).toBe('');

    expect(renderToStaticMarkup(<OfflineDataNotice fromCache={false} stale />)).toBe('');
  });

  it('muestra el texto y el icono cloud-offline-outline cuando fromCache && stale', () => {
    const html = renderToStaticMarkup(
      <OfflineDataNotice
        fromCache
        stale
        lastSyncedAt="2026-11-14T11:45:00.000Z"
        now={now}
        testID="notice"
      />,
    );

    expect(html).toContain('data-icon="cloud-offline-outline"');
    expect(html).toContain('Datos guardados en este dispositivo · actualizados hace 15 minutos');
  });

  it('usa el texto sin tiempo cuando no hay marca temporal', () => {
    const html = renderToStaticMarkup(
      <OfflineDataNotice fromCache stale lastSyncedAt={null} now={now} />,
    );

    expect(html).toContain('Datos guardados en este dispositivo');
    expect(html).not.toContain('actualizados hace');
  });
});
