import type { CreateFeedingLogInput, FeedingLogResponse } from '@nutrikids/shared';
import { useCallback, useState } from 'react';
import i18n from '../i18n/index.js';
import { createChildFeedingLog } from '../lib/feeding-api.js';

const MISSING_CHILD_FALLBACK = 'Falta elegir el niño para registrar su alimentación.';

/**
 * Estado y acción para guardar el registro diario de alimentación de un niño.
 */
export function useFeedingLog(childId: string | null) {
  const [saving, setSaving] = useState(false);

  const create = useCallback(
    async (input: CreateFeedingLogInput): Promise<FeedingLogResponse> => {
      if (!childId) {
        throw new Error(i18n.t('errors:feeding.missingChild', MISSING_CHILD_FALLBACK));
      }

      setSaving(true);
      try {
        return await createChildFeedingLog(childId, input);
      } finally {
        setSaving(false);
      }
    },
    [childId],
  );

  return {
    saving,
    create,
  };
}
