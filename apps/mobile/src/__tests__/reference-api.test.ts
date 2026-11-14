import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { fetchReferenceCurves } from '../lib/reference-api.js';

const series = [
  { x: 12, y: 8 },
  { x: 13, y: 8.2 },
];

const curvesResponse = {
  version: 'WHO 2006',
  indicator: 'WEIGHT_FOR_AGE',
  sex: 'MALE',
  xAxis: 'age_months',
  curves: { '-3': series, '-2': series, '0': series, '+2': series, '+3': series },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('reference-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the curves of an indicator and sex and parses the response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(curvesResponse));
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchReferenceCurves({ indicator: 'WEIGHT_FOR_AGE', sex: 'MALE' });

    const url = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/reference/curves');
    expect(url.searchParams.get('indicator')).toBe('WEIGHT_FOR_AGE');
    expect(url.searchParams.get('sex')).toBe('MALE');
    expect(url.searchParams.has('position')).toBe(false);
    expect(result.curves['0']).toEqual(series);
  });

  it('adds the position for weight-for-length/height', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ...curvesResponse,
        indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
        xAxis: 'height_cm',
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    await fetchReferenceCurves({
      indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
      sex: 'FEMALE',
      position: 'STANDING',
    });

    const url = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(url.searchParams.get('position')).toBe('STANDING');
    expect(url.searchParams.get('sex')).toBe('FEMALE');
  });

  it('rejects an invalid query before calling the API', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchReferenceCurves({ indicator: 'HEAD_CIRCUMFERENCE', sex: 'MALE' } as never),
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws the API message when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Bad Request', message: 'Indicador inválido' }, 400),
        ),
    );

    await expect(fetchReferenceCurves({ indicator: 'BMI_FOR_AGE', sex: 'MALE' })).rejects.toThrow(
      'Indicador inválido',
    );
  });

  it('throws when the answer does not match the shared schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ version: 'WHO 2006' })));

    await expect(fetchReferenceCurves({ indicator: 'BMI_FOR_AGE', sex: 'MALE' })).rejects.toThrow();
  });
});
