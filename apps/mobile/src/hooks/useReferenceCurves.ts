import type { ReferenceCurvesQuery, ReferenceCurvesResponse } from '@nutrikids/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { fetchReferenceCurves } from '../lib/reference-api.js';

export type ReferenceCurvesStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReferenceCurvesHookState {
  status: ReferenceCurvesStatus;
  curves: ReferenceCurvesResponse | null;
  error: string | null;
}

/**
 * WHO reference curves for the given indicator/sex/position. Loads on mount and whenever the
 * query changes; pass `null` to wait (for example while the child is not known yet).
 */
export function useReferenceCurves(query: ReferenceCurvesQuery | null) {
  const [state, setState] = useState<ReferenceCurvesHookState>({
    status: 'idle',
    curves: null,
    error: null,
  });

  /** Only the latest load may update the state (the indicator can change while one is in flight). */
  const latestLoad = useRef(0);

  const indicator = query?.indicator;
  const sex = query?.sex;
  const position = query?.position;

  const load = useCallback(async (): Promise<ReferenceCurvesResponse | null> => {
    const requestId = ++latestLoad.current;
    if (!indicator || !sex) {
      setState({ status: 'idle', curves: null, error: null });
      return null;
    }

    setState({ status: 'loading', curves: null, error: null });

    try {
      const curves = await fetchReferenceCurves({
        indicator,
        sex,
        ...(position ? { position } : {}),
      });
      if (requestId !== latestLoad.current) return curves;
      setState({ status: 'ready', curves, error: null });
      return curves;
    } catch (err) {
      if (requestId !== latestLoad.current) return null;
      setState({
        status: 'error',
        curves: null,
        error: err instanceof Error ? err.message : i18n.t('errors:reference.fetch'),
      });
      return null;
    }
  }, [indicator, sex, position]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...state,
    load,
  };
}
