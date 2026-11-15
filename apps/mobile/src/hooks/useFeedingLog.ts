import type { CreateFeedingLogInput } from '@nutrikids/shared';
import { useCallback, useState } from 'react';
import { useOptionalAuth } from '../context/auth-context.js';
import { useConnection } from '../context/connection-context.js';
import i18n from '../i18n/index.js';
import {
  createFeedingWithOfflineFallback,
  type CreateFeedingResult,
} from '../lib/offline-feeding.js';

export type { CreateFeedingResult } from '../lib/offline-feeding.js';

const MISSING_CHILD_FALLBACK = 'Falta elegir el niño para registrar su alimentación.';

/**
 * Estado y acción para guardar el registro diario de alimentación de un niño.
 */
export function useFeedingLog(childId: string | null) {
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;
  const { isOnline } = useConnection();
  const [saving, setSaving] = useState(false);

  const create = useCallback(
    async (input: CreateFeedingLogInput): Promise<CreateFeedingResult> => {
      if (!childId) {
        throw new Error(i18n.t('errors:feeding.missingChild', MISSING_CHILD_FALLBACK));
      }

      setSaving(true);
      try {
        return await createFeedingWithOfflineFallback({
          userId,
          childId,
          input,
          isOnline,
        });
      } finally {
        setSaving(false);
      }
    },
    [childId, isOnline, userId],
  );

  return {
    saving,
    create,
  };
}
