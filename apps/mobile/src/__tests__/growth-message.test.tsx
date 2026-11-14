import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authFetchMock = vi.fn();

vi.mock('../lib/api.js', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
  parseApiError: (_payload: unknown, fallback: string) => ({ message: fallback }),
}));

const hookState = vi.hoisted(() => ({
  value: { status: 'loading', message: null, reload: () => undefined } as {
    status: string;
    message: unknown;
    reload: () => void;
  },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('../hooks/useGrowthMessage.js', () => ({
  useGrowthMessage: () => hookState.value,
}));

import { ChildGrowthStatus } from '../components/ChildGrowthStatus.js';
import { fetchGrowthMessage } from '../lib/growth-message-api.js';

const CHILD_ID = '3f1c0f9e-6a53-4f0e-9a64-0d3a3d3c6b11';

function reviewed(extra: Record<string, unknown> = {}) {
  return {
    childId: CHILD_ID,
    status: 'reviewed',
    concern: 'below',
    recommendation: 'Ofrecer cinco comidas al día',
    nextCheckupDate: '2026-12-01',
    reviewedAt: '2026-11-14T10:00:00.000Z',
    ...extra,
  };
}

describe('fetchGrowthMessage', () => {
  beforeEach(() => authFetchMock.mockReset());

  it('parses the message returned by the API', async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => reviewed() });
    const message = await fetchGrowthMessage(CHILD_ID);

    expect(authFetchMock).toHaveBeenCalledWith(`/children/${CHILD_ID}/growth-message`);
    expect(message).toMatchObject({ status: 'reviewed', concern: 'below' });
  });

  it('throws a readable error when the API fails', async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(fetchGrowthMessage(CHILD_ID)).rejects.toThrow();
  });

  it('rejects a response that does not match the contract', async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'maybe' }) });
    await expect(fetchGrowthMessage(CHILD_ID)).rejects.toThrow();
  });
});

describe('ChildGrowthStatus', () => {
  const render = () =>
    renderToString(
      React.createElement(ChildGrowthStatus, { childId: CHILD_ID, childName: 'Mateo' }),
    );

  it('shows "Todo va bien" while loading, on error and before the review', () => {
    for (const state of [
      { status: 'loading', message: null },
      { status: 'error', message: null },
      {
        status: 'ready',
        message: { ...reviewed(), status: 'ok', concern: null, recommendation: null },
      },
    ]) {
      hookState.value = { ...state, reload: () => undefined };
      const html = render();
      expect(html).toContain('Todo va bien');
      expect(html).not.toContain('Revisado por tu profesional');
    }
  });

  it('after the review shows the orientation, the recommendation and the next checkup', () => {
    hookState.value = { status: 'ready', message: reviewed(), reload: () => undefined };
    const html = render();

    expect(html).toContain('Revisado por tu profesional');
    expect(html).toContain('por debajo de lo esperado');
    expect(html).toContain('Mateo');
    expect(html).toContain('Ofrecer cinco comidas al día');
    expect(html).toContain('Próximo control');
    expect(html).not.toContain('Todo va bien');
  });

  it('uses a generic text without direction and omits missing parts', () => {
    hookState.value = {
      status: 'ready',
      message: reviewed({ concern: null, recommendation: null, nextCheckupDate: null }),
      reload: () => undefined,
    };
    const html = render();

    expect(html).toContain('revisó los últimos controles de Mateo');
    expect(html).not.toContain('Recomendación');
    expect(html).not.toContain('Próximo control');
  });
});
