import type { ChildResponse, ErasureRequestResponse, RectifyChildInput } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import {
  cancelErasureRequest,
  fetchChildExport,
  fetchErasureRequests,
  isNotLegalRepresentativeError,
  rectifyChild,
  removeChild,
  requestErasure,
} from '../lib/data-rights-api.js';
import { buildHistoryCsv, deliverHistoryCsv, historyFileName } from '../lib/history-export.js';

export type DataRightsStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  /** The user is not the legal representative of the child: the API answers 403. */
  | 'forbidden'
  | 'error';

export interface DataRightsHookState {
  status: DataRightsStatus;
  /** Deletion requests of the child, newest first. */
  requests: ErasureRequestResponse[];
  error: string | null;
}

/**
 * Data rights of the legal representative over one child (NK-41/NK-55): deletion requests,
 * history export and rectification. `load` reads the requests, which also tells whether the user
 * is the legal representative (403 → `forbidden`). The actions throw so the screen can show the
 * API message; they never change `status` into `error`.
 */
export function useDataRights(childId: string | null) {
  const [state, setState] = useState<DataRightsHookState>({
    status: 'idle',
    requests: [],
    error: null,
  });
  const [busy, setBusy] = useState<'erasure' | 'cancel' | 'export' | 'rectify' | 'remove' | null>(
    null,
  );
  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<ErasureRequestResponse[] | null> => {
    const requestId = ++latestLoad.current;
    if (!childId) {
      setState({ status: 'idle', requests: [], error: null });
      return null;
    }

    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const requests = await fetchErasureRequests(childId);
      if (requestId !== latestLoad.current) return requests;
      setState({ status: 'ready', requests, error: null });
      return requests;
    } catch (err) {
      if (requestId !== latestLoad.current) return null;
      setState({
        status: isNotLegalRepresentativeError(err) ? 'forbidden' : 'error',
        requests: [],
        error: err instanceof Error ? err.message : i18n.t('errors:dataRights.erasureList'),
      });
      return null;
    }
  }, [childId]);

  /** Runs an action marking it as busy; any error goes to the caller. */
  const run = useCallback(
    async <T>(action: NonNullable<typeof busy>, task: () => Promise<T>): Promise<T> => {
      setBusy(action);
      try {
        return await task();
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const requestDeletion = useCallback(
    (): Promise<ErasureRequestResponse> =>
      run('erasure', async () => {
        if (!childId) throw new Error(i18n.t('errors:dataRights.missingChild'));
        const request = await requestErasure(childId);
        setState((prev) => ({
          status: 'ready',
          requests: [request, ...prev.requests.filter((item) => item.id !== request.id)],
          error: null,
        }));
        return request;
      }),
    [childId, run],
  );

  /** Soft-deletes the child: it stops showing in the app. */
  const remove = useCallback(
    (): Promise<void> =>
      run('remove', async () => {
        if (!childId) throw new Error(i18n.t('errors:dataRights.missingChild'));
        await removeChild(childId);
      }),
    [childId, run],
  );

  const cancelDeletion = useCallback(
    (requestId: string): Promise<ErasureRequestResponse> =>
      run('cancel', async () => {
        if (!childId) throw new Error(i18n.t('errors:dataRights.missingChild'));
        const cancelled = await cancelErasureRequest(childId, requestId);
        setState((prev) => ({
          ...prev,
          requests: prev.requests.map((item) => (item.id === requestId ? cancelled : item)),
        }));
        return cancelled;
      }),
    [childId, run],
  );

  /** Downloads the data of the child and hands the history over as a CSV. */
  const exportHistory = useCallback(
    (): Promise<void> =>
      run('export', async () => {
        if (!childId) throw new Error(i18n.t('errors:dataRights.missingChild'));
        const data = await fetchChildExport(childId);
        await deliverHistoryCsv(historyFileName(data.child.firstName), buildHistoryCsv(data));
      }),
    [childId, run],
  );

  const rectify = useCallback(
    (input: RectifyChildInput): Promise<ChildResponse> =>
      run('rectify', async () => {
        if (!childId) throw new Error(i18n.t('errors:dataRights.missingChild'));
        return rectifyChild(childId, input);
      }),
    [childId, run],
  );

  /** The pending deletion request, if any (only one can be pending at a time). */
  const pendingRequest = state.requests.find((item) => item.status === 'pending') ?? null;

  return {
    ...state,
    busy,
    pendingRequest,
    load,
    requestDeletion,
    cancelDeletion,
    remove,
    exportHistory,
    rectify,
  };
}
