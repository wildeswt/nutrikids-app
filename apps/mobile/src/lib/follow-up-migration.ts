import {
  clearLegacyUserFollowUpData,
  readLegacyFollowUpStore,
  resolveFollowUpQueueId,
  toFollowUpDraftMetaKey,
  type LegacyFollowUpStore,
} from './follow-up-storage.js';
import { getMetaValue, setMetaValue } from './local-db/meta-repository.js';
import type { SyncFollowUpBatchQueuePayload } from './local-db/sync-queue-repository.js';
import type { LocalDb } from './local-db/types.js';

export const FOLLOW_UP_MIGRATION_META_PREFIX = 'followup-migration:v1:';

export function followUpMigrationMetaKey(userId: string): string {
  return `${FOLLOW_UP_MIGRATION_META_PREFIX}${userId}`;
}

export interface MigrateLegacyFollowUpOptions {
  readLegacyStore?: () => Promise<LegacyFollowUpStore>;
  clearLegacyUser?: (userId: string) => Promise<void>;
  now?: () => Date;
}

export interface MigrateLegacyFollowUpResult {
  migratedPending: number;
  migratedDrafts: number;
  alreadyMigrated: boolean;
}

/**
 * Migra de forma idempotente los seguimientos pendientes y borradores de SecureStore hacia la
 * base local cifrada del usuario indicado.
 *
 * Toda la escritura en SQLite (`sync_queue`, `meta` y marca de migración) ocurre dentro de una
 * única transacción; el almacén antiguo de ese usuario solo se limpia después de confirmar la
 * transacción. Si algo falla a mitad, no se pierde ningún dato.
 */
export async function migrateLegacyFollowUpStorage(
  db: LocalDb,
  userId: string,
  options: MigrateLegacyFollowUpOptions = {},
): Promise<MigrateLegacyFollowUpResult> {
  const metaKey = followUpMigrationMetaKey(userId);
  const existingMarker = await getMetaValue(db, metaKey);
  if (existingMarker !== null) {
    return { migratedPending: 0, migratedDrafts: 0, alreadyMigrated: true };
  }

  const readStore = options.readLegacyStore ?? readLegacyFollowUpStore;
  const clearLegacy = options.clearLegacyUser ?? clearLegacyUserFollowUpData;
  const now = options.now ?? (() => new Date());

  const legacy = await readStore();
  const userPending = legacy.pending.filter((entry) => entry.userId === userId);
  const userDrafts = Object.entries(legacy.drafts).filter(
    ([key, draft]) => draft.userId === userId || key.startsWith(`${userId}:`),
  );

  const migratedAt = now().toISOString();

  await db.withTransactionAsync(async () => {
    for (const entry of userPending) {
      const id = resolveFollowUpQueueId(entry.input);
      const payload: SyncFollowUpBatchQueuePayload = {
        childId: entry.childId,
        ...(entry.alertId ? { alertId: entry.alertId } : {}),
        establish: entry.establish,
        batch: entry.input,
      };
      await db.runAsync(
        `INSERT INTO sync_queue (
           id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
         )
         VALUES (?, ?, 'follow-up', ?, 'LOCAL', 0, NULL, NULL, ?, ?)
         ON CONFLICT(id) DO NOTHING;`,
        [id, userId, JSON.stringify(payload), entry.queuedAt, migratedAt],
      );
    }

    for (const [rawKey, draft] of userDrafts) {
      const draftMetaKey = toFollowUpDraftMetaKey(rawKey, userId);
      await db.runAsync(
        `INSERT INTO meta (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO NOTHING;`,
        [draftMetaKey, JSON.stringify(draft)],
      );
    }

    await setMetaValue(
      db,
      metaKey,
      JSON.stringify({
        migratedAt,
        pending: userPending.length,
        drafts: userDrafts.length,
      }),
    );
  });

  if (userPending.length > 0 || userDrafts.length > 0) {
    await clearLegacy(userId);
  }

  return {
    migratedPending: userPending.length,
    migratedDrafts: userDrafts.length,
    alreadyMigrated: false,
  };
}
