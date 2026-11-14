import type { ChildResponse, CreateChildInput } from '@nutrikids/shared';
import { useCallback, useState } from 'react';
import { createChild, fetchCaregiverChildren } from '../lib/children-api.js';

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

  const load = useCallback(async (): Promise<ChildResponse[]> => {
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
      const message =
        err instanceof Error ? err.message : 'Error desconocido al cargar la lista de niños';
      setState({
        status: 'error',
        children: [],
        error: message,
      });
      throw err;
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
      const message = err instanceof Error ? err.message : 'Error al registrar al niño';
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
