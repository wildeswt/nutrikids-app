import type { ChildResponse, CreateChildInput } from '@nutrikids/shared';
import { useCallback, useState } from 'react';
import { createChild, fetchCaregiverChildren } from '../lib/children-api.js';
import i18n from '../i18n/index.js';

export type ChildrenStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface ChildrenHookState {
  status: ChildrenStatus;
  children: ChildResponse[];
  error: string | null;
}

export function useChildren() {
  const [state, setState] = useState<ChildrenHookState>({
    status: 'idle',
    children: [],
    error: null,
  });

  const load = useCallback(async (): Promise<ChildResponse[] | null> => {
    setState((prev) => ({
      ...prev,
      status: prev.children.length === 0 ? 'loading' : prev.status,
      error: null,
    }));

    try {
      const children = await fetchCaregiverChildren();
      if (children.length === 0) {
        setState({ status: 'empty', children: [], error: null });
      } else {
        setState({ status: 'ready', children, error: null });
      }
      return children;
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n.t('errors:consent.childList');
      setState((prev) => ({
        ...prev,
        status: 'error',
        children: prev.children,
        error: message,
      }));
      return null;
    }
  }, []);

  const create = useCallback(async (input: CreateChildInput): Promise<ChildResponse> => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    try {
      const newChild = await createChild(input);
      setState((prev) => {
        const updated = [...prev.children, newChild];
        return { status: 'ready', children: updated, error: null };
      });
      return newChild;
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n.t('errors:children.create');
      setState((prev) => ({
        ...prev,
        status: prev.children.length === 0 ? 'empty' : 'ready',
        error: message,
      }));
      throw err;
    }
  }, []);

  return {
    ...state,
    load,
    create,
  };
}
