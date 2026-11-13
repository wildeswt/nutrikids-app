import type { ConsentResponse } from '@nutrikids/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  CURRENT_CONSENT_VERSION,
  fetchConsentForChild,
  grantConsentForChild,
  revokeConsentForChild,
} from '../lib/consent-api.js';

export type ConsentStatus = 'idle' | 'loading' | 'active' | 'revoked' | 'none' | 'error';

export interface ConsentHookState {
  status: ConsentStatus;
  consent: ConsentResponse | null;
  error: string | null;
}

export function useConsent(childId: string | null) {
  const [state, setState] = useState<ConsentHookState>({
    status: 'idle',
    consent: null,
    error: null,
  });

  const load = useCallback(async () => {
    if (!childId) {
      setState({ status: 'idle', consent: null, error: null });
      return;
    }

    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    try {
      const consent = await fetchConsentForChild(childId);
      if (!consent) {
        setState({ status: 'none', consent: null, error: null });
      } else if (consent.revokedAt) {
        setState({ status: 'revoked', consent, error: null });
      } else {
        setState({ status: 'active', consent, error: null });
      }
    } catch (err) {
      setState({
        status: 'error',
        consent: null,
        error: err instanceof Error ? err.message : 'Error desconocido al cargar consentimiento',
      });
    }
  }, [childId]);

  const grant = useCallback(
    async (textVersion: string = CURRENT_CONSENT_VERSION) => {
      if (!childId) {
        throw new Error('Se requiere un identificador de niño para otorgar consentimiento');
      }

      setState((prev) => ({ ...prev, status: 'loading', error: null }));

      try {
        const consent = await grantConsentForChild(childId, textVersion);
        setState({ status: 'active', consent, error: null });
        return consent;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al registrar el consentimiento';
        setState((prev) => ({ ...prev, status: 'error', error: message }));
        throw err;
      }
    },
    [childId],
  );

  const revoke = useCallback(async () => {
    if (!childId) {
      throw new Error('Se requiere un identificador de niño para revocar consentimiento');
    }

    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    try {
      const consent = await revokeConsentForChild(childId);
      setState({ status: 'revoked', consent, error: null });
      return consent;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al revocar el consentimiento informado';
      setState((prev) => ({ ...prev, status: 'error', error: message }));
      throw err;
    }
  }, [childId]);

  useEffect(() => {
    if (childId) {
      void load();
    }
  }, [childId, load]);

  return {
    ...state,
    load,
    grant,
    revoke,
  };
}
