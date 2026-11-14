import type { CaregiverCheckupResponse, CreateCheckupInput } from '@nutrikids/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { createChildCheckup, fetchChildCheckups } from '../lib/checkups-api.js';

export type CheckupsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface CheckupsHookState {
  status: CheckupsStatus;
  checkups: CaregiverCheckupResponse[];
  error: string | null;
}

/**
 * Current checkups of a child (newest first). Loads on mount and whenever `childId` changes
 * (unless `autoLoad` is false); `create` registers a new one and adds it to the list.
 */
export function useCheckups(childId: string | null, options: { autoLoad?: boolean } = {}) {
  const autoLoad = options.autoLoad ?? true;
  const [state, setState] = useState<CheckupsHookState>({
    status: 'idle',
    checkups: [],
    error: null,
  });
  const [saving, setSaving] = useState(false);
  /** Only the latest load may update the state (the child can change while one is in flight). */
  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<CaregiverCheckupResponse[] | null> => {
    const requestId = ++latestLoad.current;
    if (!childId) {
      setState({ status: 'idle', checkups: [], error: null });
      return null;
    }

    setState({ status: 'loading', checkups: [], error: null });

    try {
      const checkups = await fetchChildCheckups(childId);
      if (requestId !== latestLoad.current) return checkups;
      setState({ status: checkups.length === 0 ? 'empty' : 'ready', checkups, error: null });
      return checkups;
    } catch (err) {
      if (requestId !== latestLoad.current) return null;
      setState({
        status: 'error',
        checkups: [],
        error: err instanceof Error ? err.message : i18n.t('errors:checkups.fetch'),
      });
      return null;
    }
  }, [childId]);

  const create = useCallback(
    async (input: CreateCheckupInput): Promise<CaregiverCheckupResponse> => {
      if (!childId) {
        throw new Error(i18n.t('errors:checkups.missingChild'));
      }

      setSaving(true);
      try {
        const checkup = await createChildCheckup(childId, input);
        setState((prev) => ({
          status: 'ready',
          checkups: [checkup, ...prev.checkups.filter((item) => item.id !== checkup.id)],
          error: null,
        }));
        return checkup;
      } finally {
        setSaving(false);
      }
    },
    [childId],
  );

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  return {
    ...state,
    saving,
    load,
    create,
  };
}
