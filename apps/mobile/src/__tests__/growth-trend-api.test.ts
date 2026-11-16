import { describe, expect, it, vi } from 'vitest';
import { fetchGrowthTrend, GrowthTrendApiError } from '../lib/growth-trend-api.js';

const mockAuthFetch = vi.fn();

vi.mock('../lib/api.js', () => ({
  authFetch: (url: string, init?: RequestInit) => mockAuthFetch(url, init),
  parseApiError: (payload: unknown, fallback: string) => ({
    error: 'ApiError',
    message:
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : fallback,
  }),
}));

describe('fetchGrowthTrend client (NK-74)', () => {
  const childId = '11111111-1111-4111-8111-111111111111';

  it('llama al endpoint correcto y valida la respuesta exitosa', async () => {
    const mockData = [
      {
        indicator: 'WEIGHT_FOR_AGE',
        trend: 'FAVORABLE',
        basedOnCheckupId: '22222222-2222-4222-8222-222222222222',
      },
    ];

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const result = await fetchGrowthTrend(childId);

    expect(mockAuthFetch).toHaveBeenCalledWith(`/children/${childId}/growth-trend`, undefined);
    expect(result).toEqual(mockData);
  });

  it('lanza GrowthTrendApiError cuando la respuesta no es ok', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'No tienes acceso a este niño' }),
    });

    await expect(fetchGrowthTrend(childId)).rejects.toThrow(GrowthTrendApiError);
  });

  it('falla la validación si el servidor envía datos con formato inesperado', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ indicator: 'INVALID_INDICATOR', trend: 'INVALID' }],
    });

    await expect(fetchGrowthTrend(childId)).rejects.toThrow();
  });
});
