import type { GrowthTrendResponse } from '@nutrikids/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchGrowthTrend } from '../lib/growth-trend-api.js';

export type GrowthTrendStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GrowthTrendHookState {
  status: GrowthTrendStatus;
  trends: GrowthTrendResponse | null;
  error: string | null;
}

/**
 * Hook para consultar la tendencia de crecimiento favorable por indicador (NK-74).
 * Carga automáticamente al montar o al cambiar `childId`.
 * Si la petición falla, mantiene `trends: null` para que la pantalla continúe funcionando
 * sin mostrar datos ni romperse.
 */
export function useGrowthTrend(childId: string | null) {
  const [state, setState] = useState<GrowthTrendHookState>({
    status: 'idle',
    trends: null,
    error: null,
  });

  const load = useCallback(async (): Promise<GrowthTrendResponse | null> => {
    if (!childId) {
      setState({ status: 'idle', trends: null, error: null });
      return null;
    }

    setState({ status: 'loading', trends: null, error: null });

    try {
      const data = await fetchGrowthTrend(childId);
      setState({ status: 'ready', trends: data, error: null });
      return data;
    } catch (err) {
      // Si la petición falla o no hay dato, no muestra nada (nunca rompe la pantalla)
      setState({
        status: 'error',
        trends: null,
        error: err instanceof Error ? err.message : 'Error al cargar tendencia',
      });
      return null;
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, load };
}
