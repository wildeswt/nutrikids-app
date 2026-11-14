import { useCallback, useState } from 'react';
import { useAuth } from '../context/auth-context.js';
import { listPending } from '../lib/follow-up-storage.js';
import { flushPendingFollowUps } from '../lib/follow-up-sync.js';

/**
 * Follow-ups this professional saved without connection (NK-34). `syncPending` tries to send them
 * and counts the ones still waiting for the given alert, so the alert detail can say so.
 */
export function usePendingFollowUps(alertId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [pendingCount, setPendingCount] = useState(0);

  const syncPending = useCallback(async (): Promise<void> => {
    if (!userId) return;
    try {
      await flushPendingFollowUps(userId);
    } catch {
      /* they stay queued */
    }
    try {
      const pending = await listPending(userId);
      setPendingCount(pending.filter((entry) => entry.alertId === alertId).length);
    } catch {
      setPendingCount(0);
    }
  }, [userId, alertId]);

  return { pendingCount, syncPending };
}
