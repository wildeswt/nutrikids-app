import type { GrowthMessageResponse } from '@nutrikids/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchGrowthMessage } from '../lib/growth-message-api.js';

export type GrowthMessageStatus = 'loading' | 'ready' | 'error';

/**
 * Loads the growth message of a child. On error the screen keeps the neutral state: the
 * caregiver never sees a clinical message that was not confirmed by the API.
 */
export function useGrowthMessage(childId: string) {
  const [status, setStatus] = useState<GrowthMessageStatus>('loading');
  const [message, setMessage] = useState<GrowthMessageResponse | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setMessage(await fetchGrowthMessage(childId));
      setStatus('ready');
    } catch {
      setMessage(null);
      setStatus('error');
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, message, reload: load };
}
