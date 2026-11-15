import {
  CreateFollowUpBatchInputSchema,
  UuidSchema,
  type CreateFollowUpBatchInput,
} from '@nutrikids/shared';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { isoDateToInput, type FollowUpFormData } from './follow-up-form.js';
import { getMetaValue, removeMetaValue, setMetaValue } from './local-db/meta-repository.js';
import { nowUtcIso, parseStoredPayload } from './local-db/payload-codec.js';
import {
  listSyncItemsByKindAndStatuses,
  type SyncFollowUpBatchQueuePayload,
  type SyncFollowUpPayload,
  type SyncQueueRecord,
} from './local-db/sync-queue-repository.js';
import type { LocalDb } from './local-db/types.js';
import { tryGetLocalDatabase, tryLocalOperation } from './offline-read.js';

/**
 * Persistencia local de borradores y seguimientos pendientes (NK-34, NK-75, NK-62).
 *
 * Cuando la base cifrada local está disponible, los pendientes viven en `sync_queue` y los
 * borradores en `meta`. Si no hay base local (Expo Go o web), se degrada de forma transparente al
 * almacén heredado en SecureStore (`nutrikids.followups`).
 */
export const FOLLOW_UP_STORAGE_KEY = 'nutrikids.followups';
export const FOLLOW_UP_DRAFT_META_PREFIX = 'followup-draft:';
const PENDING_QUEUE_STATUSES = ['LOCAL', 'SENDING'] as const;
const ACTIVE_QUEUE_STATUSES = ['LOCAL', 'SENDING', 'ERROR'] as const;

/** Schema de formulario con soporte de migración desde borradores de un solo ítem. */
export const FormDraftSchema = z.preprocess(
  (val: unknown) => {
    if (typeof val === 'object' && val !== null) {
      const v = val as Record<string, unknown>;
      if ('type' in v || 'details' in v) {
        const type = v.type as string | null | undefined;
        const details = typeof v.details === 'string' ? v.details : '';
        return {
          observations: type === 'observation' ? details : (v.observations ?? ''),
          intervention:
            type === 'intervention' || type === 'recommendation' ? details : (v.intervention ?? ''),
          referral: type === 'referral' ? details : (v.referral ?? ''),
          nextCheckupText: typeof v.nextCheckupText === 'string' ? v.nextCheckupText : '',
          establish: typeof v.establish === 'boolean' ? v.establish : true,
        };
      }
    }
    return val;
  },
  z.object({
    observations: z.string().default(''),
    intervention: z.string().default(''),
    referral: z.string().default(''),
    nextCheckupText: z.string().default(''),
    establish: z.boolean().default(true),
  }),
);

export const DraftSchema = z.object({
  userId: UuidSchema,
  childId: UuidSchema,
  alertId: UuidSchema.optional(),
  form: FormDraftSchema,
  savedAt: z.string(),
  /** Razón por la que el servidor rechazó el seguimiento desde la cola. */
  lastError: z.string().optional(),
});

export const PendingBatchSchema = z.object({
  userId: UuidSchema,
  childId: UuidSchema,
  alertId: UuidSchema.optional(),
  /** Mueve la alerta a «seguimiento establecido» luego de guardar el lote. */
  establish: z.boolean(),
  input: CreateFollowUpBatchInputSchema,
  queuedAt: z.string(),
});

/** Schema con preprocesamiento para migrar colas antiguas de un solo ítem sin perder datos. */
export const PendingSchema = z.preprocess((val: unknown) => {
  if (typeof val === 'object' && val !== null) {
    const v = val as Record<string, unknown>;
    const input = v.input as Record<string, unknown> | undefined;
    if (input && !('items' in input) && 'id' in input && 'type' in input && 'details' in input) {
      return {
        userId: v.userId,
        childId: v.childId,
        alertId: v.alertId ?? input.alertId,
        establish: Boolean(v.establish),
        queuedAt: typeof v.queuedAt === 'string' ? v.queuedAt : new Date().toISOString(),
        input: {
          groupId: input.groupId,
          alertId: input.alertId ?? v.alertId,
          nextCheckupDate: input.nextCheckupDate,
          items: [
            {
              id: input.id,
              type: input.type,
              details: input.details,
            },
          ],
        },
      };
    }
  }
  return val;
}, PendingBatchSchema);

export const StoreSchema = z.object({
  drafts: z.record(z.string(), DraftSchema),
  pending: z.array(PendingSchema),
});

export type FollowUpDraft = z.infer<typeof DraftSchema>;
export type PendingFollowUp = z.infer<typeof PendingBatchSchema>;
export type FollowUpPending = PendingFollowUp;
export type LegacyFollowUpStore = z.infer<typeof StoreSchema>;

export interface RejectedFollowUpEntry extends FollowUpDraft {
  queueId: string;
}

const memoryStorage = new Map<string, string>();

async function hasSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function readRaw(): Promise<string | null> {
  if (await hasSecureStore()) {
    return SecureStore.getItemAsync(FOLLOW_UP_STORAGE_KEY, SECURE_STORE_OPTIONS);
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(FOLLOW_UP_STORAGE_KEY);
  }
  return memoryStorage.get(FOLLOW_UP_STORAGE_KEY) ?? null;
}

async function writeRaw(value: string): Promise<void> {
  if (await hasSecureStore()) {
    await SecureStore.setItemAsync(FOLLOW_UP_STORAGE_KEY, value, SECURE_STORE_OPTIONS);
  } else if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(FOLLOW_UP_STORAGE_KEY, value);
  } else {
    memoryStorage.set(FOLLOW_UP_STORAGE_KEY, value);
  }
}

async function deleteRaw(): Promise<void> {
  if (await hasSecureStore()) {
    await SecureStore.deleteItemAsync(FOLLOW_UP_STORAGE_KEY, SECURE_STORE_OPTIONS);
  } else if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(FOLLOW_UP_STORAGE_KEY);
  } else {
    memoryStorage.delete(FOLLOW_UP_STORAGE_KEY);
  }
}

export async function readLegacyFollowUpStore(): Promise<LegacyFollowUpStore> {
  try {
    const raw = await readRaw();
    if (!raw) return { drafts: {}, pending: [] };
    const parsed = StoreSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { drafts: {}, pending: [] };
  } catch {
    // Si el almacén antiguo está corrupto se trata como vacío; se reemplaza en la siguiente escritura.
    return { drafts: {}, pending: [] };
  }
}

/** Las operaciones sobre SecureStore se serializan para evitar sobrescrituras entre escrituras. */
let queue: Promise<unknown> = Promise.resolve();

function updateLegacyStore<T>(change: (store: LegacyFollowUpStore) => T): Promise<T> {
  const run = async (): Promise<T> => {
    const store = await readLegacyFollowUpStore();
    const result = change(store);
    await writeRaw(JSON.stringify(store));
    return result;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** Clave de borrador: asociada a la alerta que responde o al niño cuando no hay alerta. */
export function draftKey(
  userId: string,
  target: { alertId?: string | undefined; childId: string },
): string {
  return `${userId}:${target.alertId ? `alert:${target.alertId}` : `child:${target.childId}`}`;
}

export function toFollowUpDraftMetaKey(key: string, userId?: string): string {
  if (key.startsWith(FOLLOW_UP_DRAFT_META_PREFIX)) {
    return key;
  }
  if (userId && !key.startsWith(`${userId}:`)) {
    return `${FOLLOW_UP_DRAFT_META_PREFIX}${userId}:${key}`;
  }
  return `${FOLLOW_UP_DRAFT_META_PREFIX}${key}`;
}

/** Convierte un lote enviado/pendiente al formato editable del formulario. */
export function batchToFormData(
  input: CreateFollowUpBatchInput,
  establish: boolean,
): FollowUpFormData {
  const observations = input.items.find((i) => i.type === 'observation')?.details ?? '';
  const intervention =
    input.items.find((i) => i.type === 'intervention' || i.type === 'recommendation')?.details ??
    '';
  const referral = input.items.find((i) => i.type === 'referral')?.details ?? '';

  return {
    observations,
    intervention,
    referral,
    nextCheckupText: input.nextCheckupDate ? isoDateToInput(input.nextCheckupDate) : '',
    establish,
  };
}

export function resolveFollowUpQueueId(input: CreateFollowUpBatchInput): string {
  const candidate = input.items[0]?.id ?? input.groupId;
  if (!candidate) {
    throw new Error('El lote de seguimiento requiere al menos un identificador.');
  }
  return UuidSchema.parse(candidate);
}

/** Normaliza los distintos formatos históricos de `sync_queue` al payload de lote actual. */
export function normalizeFollowUpQueuePayload(
  payload: SyncFollowUpPayload,
): SyncFollowUpBatchQueuePayload | null {
  if ('batch' in payload) {
    return payload;
  }
  if (!('childId' in payload)) {
    return null;
  }
  if ('items' in payload) {
    const { childId, ...batch } = payload;
    return {
      childId,
      ...(batch.alertId ? { alertId: batch.alertId } : {}),
      establish: Boolean(batch.alertId),
      batch,
    };
  }
  const { childId, ...single } = payload;
  return {
    childId,
    ...(single.alertId ? { alertId: single.alertId } : {}),
    establish: Boolean(single.alertId),
    batch: {
      ...(single.groupId ? { groupId: single.groupId } : {}),
      ...(single.alertId ? { alertId: single.alertId } : {}),
      ...(single.nextCheckupDate ? { nextCheckupDate: single.nextCheckupDate } : {}),
      items: [{ id: single.id, type: single.type, details: single.details }],
    },
  };
}

function collectBatchIds(input: CreateFollowUpBatchInput): Set<string> {
  const ids = new Set(input.items.map((item) => item.id));
  if (input.groupId) {
    ids.add(input.groupId);
  }
  return ids;
}

function matchesBatchIds(
  recordId: string,
  payload: SyncFollowUpPayload,
  targetIds: Set<string>,
): boolean {
  if (targetIds.has(recordId)) {
    return true;
  }
  const normalized = normalizeFollowUpQueuePayload(payload);
  if (!normalized) {
    return false;
  }
  if (normalized.batch.groupId && targetIds.has(normalized.batch.groupId)) {
    return true;
  }
  return normalized.batch.items.some((item) => targetIds.has(item.id));
}

function toPendingFollowUp(record: SyncQueueRecord): PendingFollowUp | null {
  if (record.kind !== 'follow-up') {
    return null;
  }
  const normalized = normalizeFollowUpQueuePayload(record.payload);
  if (!normalized) {
    return null;
  }
  return {
    userId: record.userId,
    childId: normalized.childId,
    ...(normalized.alertId ? { alertId: normalized.alertId } : {}),
    establish: normalized.establish,
    input: normalized.batch,
    queuedAt: record.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Operaciones sobre la base local (`meta` y `sync_queue`)
// ---------------------------------------------------------------------------

export async function getDraftInDb(db: LocalDb, key: string): Promise<FollowUpDraft | null> {
  const raw = await getMetaValue(db, toFollowUpDraftMetaKey(key));
  if (raw === null) {
    return null;
  }
  return parseStoredPayload('meta', raw, DraftSchema);
}

export async function saveDraftInDb(
  db: LocalDb,
  key: string,
  draft: {
    userId: string;
    childId: string;
    alertId?: string | undefined;
    form: FollowUpFormData;
    lastError?: string | undefined;
  },
  now: Date = new Date(),
): Promise<void> {
  const { alertId, lastError, ...rest } = draft;
  const validated = DraftSchema.parse({
    ...rest,
    ...(alertId ? { alertId } : {}),
    ...(lastError ? { lastError } : {}),
    savedAt: now.toISOString(),
  });
  await setMetaValue(db, toFollowUpDraftMetaKey(key, validated.userId), JSON.stringify(validated));
}

export async function clearDraftInDb(db: LocalDb, key: string): Promise<void> {
  await removeMetaValue(db, toFollowUpDraftMetaKey(key));
}

export async function clearDraftsInDb(db: LocalDb): Promise<void> {
  await db.runAsync('DELETE FROM meta WHERE key LIKE ?;', [`${FOLLOW_UP_DRAFT_META_PREFIX}%`]);
}

export async function listPendingFollowUpsInDb(
  db: LocalDb,
  userId: string,
): Promise<PendingFollowUp[]> {
  const records = await listSyncItemsByKindAndStatuses(
    db,
    userId,
    'follow-up',
    PENDING_QUEUE_STATUSES,
  );
  const pending: PendingFollowUp[] = [];
  for (const record of records) {
    const mapped = toPendingFollowUp(record);
    if (mapped) {
      pending.push(mapped);
    }
  }
  return pending;
}

export async function enqueuePendingFollowUpInDb(
  db: LocalDb,
  entry: Omit<PendingFollowUp, 'queuedAt'>,
  now: Date = new Date(),
): Promise<void> {
  const validated = PendingBatchSchema.parse({
    ...entry,
    queuedAt: now.toISOString(),
  });
  const queueId = resolveFollowUpQueueId(validated.input);
  const targetIds = collectBatchIds(validated.input);
  targetIds.add(queueId);

  const payload: SyncFollowUpBatchQueuePayload = {
    childId: validated.childId,
    ...(validated.alertId ? { alertId: validated.alertId } : {}),
    establish: validated.establish,
    batch: validated.input,
  };
  const serializedPayload = JSON.stringify(payload);
  const timestamp = now.toISOString();

  await db.withTransactionAsync(async () => {
    const existing = await listSyncItemsByKindAndStatuses(
      db,
      validated.userId,
      'follow-up',
      ACTIVE_QUEUE_STATUSES,
    );
    for (const row of existing) {
      if (row.kind === 'follow-up' && matchesBatchIds(row.id, row.payload, targetIds)) {
        await db.runAsync('DELETE FROM sync_queue WHERE user_id = ? AND id = ?;', [
          validated.userId,
          row.id,
        ]);
      }
    }

    await db.runAsync(
      `INSERT INTO sync_queue (
         id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
       )
       VALUES (?, ?, 'follow-up', ?, 'LOCAL', 0, NULL, NULL, ?, ?);`,
      [queueId, validated.userId, serializedPayload, timestamp, nowUtcIso()],
    );
  });
}

export async function removePendingFollowUpInDb(
  db: LocalDb,
  batchOrFollowUpId: string,
  userId?: string,
): Promise<void> {
  if (!userId) {
    const users = await db.getAllAsync<{ user_id: string }>(
      `SELECT DISTINCT user_id
       FROM sync_queue
       WHERE kind = 'follow-up' AND status IN ('LOCAL', 'SENDING', 'ERROR');`,
      [],
    );
    for (const row of users) {
      await removePendingFollowUpInDb(db, batchOrFollowUpId, row.user_id);
    }
    return;
  }

  const targetIds = new Set([batchOrFollowUpId]);
  const rows = await listSyncItemsByKindAndStatuses(db, userId, 'follow-up', ACTIVE_QUEUE_STATUSES);
  for (const row of rows) {
    if (row.kind === 'follow-up' && matchesBatchIds(row.id, row.payload, targetIds)) {
      await db.runAsync('DELETE FROM sync_queue WHERE user_id = ? AND id = ?;', [userId, row.id]);
    }
  }
}

/** Obtiene el último seguimiento rechazado (`ERROR`) del objetivo indicado para permitir corregirlo. */
export async function getLatestRejectedFollowUpInDb(
  db: LocalDb,
  userId: string,
  target: { alertId?: string | undefined; childId: string },
): Promise<RejectedFollowUpEntry | null> {
  const errored = await listSyncItemsByKindAndStatuses(db, userId, 'follow-up', ['ERROR']);
  let latest: { updatedAt: string; entry: RejectedFollowUpEntry } | null = null;

  for (const record of errored) {
    if (record.kind !== 'follow-up') {
      continue;
    }
    const normalized = normalizeFollowUpQueuePayload(record.payload);
    if (!normalized) {
      continue;
    }
    const recordAlertId = normalized.alertId ?? normalized.batch.alertId;
    const matchesTarget = target.alertId
      ? recordAlertId === target.alertId
      : !recordAlertId && normalized.childId === target.childId;

    if (!matchesTarget) {
      continue;
    }

    if (!latest || record.updatedAt >= latest.updatedAt) {
      latest = {
        updatedAt: record.updatedAt,
        entry: {
          queueId: record.id,
          userId: record.userId,
          childId: normalized.childId,
          ...(recordAlertId ? { alertId: recordAlertId } : {}),
          form: batchToFormData(normalized.batch, normalized.establish),
          savedAt: record.updatedAt,
          ...(record.lastError ? { lastError: record.lastError } : {}),
        },
      };
    }
  }

  return latest?.entry ?? null;
}

/** Elimina los seguimientos en estado `'ERROR'` del objetivo tras corregirlos o guardar un borrador. */
export async function clearRejectedFollowUpInDb(
  db: LocalDb,
  userId: string,
  target: { alertId?: string | undefined; childId: string },
): Promise<void> {
  const errored = await listSyncItemsByKindAndStatuses(db, userId, 'follow-up', ['ERROR']);
  for (const record of errored) {
    if (record.kind !== 'follow-up') {
      continue;
    }
    const normalized = normalizeFollowUpQueuePayload(record.payload);
    if (!normalized) {
      continue;
    }
    const recordAlertId = normalized.alertId ?? normalized.batch.alertId;
    const matchesTarget = target.alertId
      ? recordAlertId === target.alertId
      : !recordAlertId && normalized.childId === target.childId;

    if (matchesTarget) {
      await db.runAsync('DELETE FROM sync_queue WHERE user_id = ? AND id = ?;', [
        userId,
        record.id,
      ]);
    }
  }
}

// ---------------------------------------------------------------------------
// Operaciones de respaldo en SecureStore (degradación sin SQLite)
// ---------------------------------------------------------------------------

export async function clearLegacyUserFollowUpData(userId: string): Promise<void> {
  const run = async (): Promise<void> => {
    const store = await readLegacyFollowUpStore();
    for (const [key, draft] of Object.entries(store.drafts)) {
      if (draft.userId === userId || key.startsWith(`${userId}:`)) {
        delete store.drafts[key];
      }
    }
    store.pending = store.pending.filter((entry) => entry.userId !== userId);

    if (Object.keys(store.drafts).length === 0 && store.pending.length === 0) {
      await deleteRaw();
      return;
    }

    await writeRaw(JSON.stringify(store));
  };

  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  await next;
}

/** Elimina por completo el respaldo residual de seguimientos en SecureStore sin abrir SQLite. */
export async function clearAllLegacyFollowUpData(): Promise<void> {
  const next = queue.then(deleteRaw, deleteRaw);
  queue = next.catch(() => undefined);
  await next;
}

/** Cuenta seguimientos pendientes guardados en el respaldo de SecureStore para un usuario. */
export async function countLegacyPendingFollowUps(userId: string): Promise<number> {
  const store = await readLegacyFollowUpStore();
  return store.pending.filter((entry) => entry.userId === userId).length;
}

function legacyGetDraft(key: string): Promise<FollowUpDraft | null> {
  return readLegacyFollowUpStore().then((store) => store.drafts[key] ?? null);
}

function legacySaveDraft(
  key: string,
  draft: {
    userId: string;
    childId: string;
    alertId?: string | undefined;
    form: FollowUpFormData;
    lastError?: string | undefined;
  },
  now: Date = new Date(),
): Promise<void> {
  return updateLegacyStore((store) => {
    const { alertId, lastError, ...rest } = draft;
    store.drafts[key] = {
      ...rest,
      ...(alertId ? { alertId } : {}),
      ...(lastError ? { lastError } : {}),
      savedAt: now.toISOString(),
    };
  });
}

function legacyClearDraft(key: string): Promise<void> {
  return updateLegacyStore((store) => {
    delete store.drafts[key];
  });
}

function legacyClearDrafts(): Promise<void> {
  return updateLegacyStore((store) => {
    store.drafts = {};
  });
}

async function legacyListPending(userId: string): Promise<PendingFollowUp[]> {
  const store = await readLegacyFollowUpStore();
  return store.pending.filter((entry) => entry.userId === userId);
}

function legacyAddPending(
  entry: Omit<PendingFollowUp, 'queuedAt'>,
  now = new Date(),
): Promise<void> {
  return updateLegacyStore((store) => {
    const entryIds = collectBatchIds(entry.input);
    store.pending = store.pending.filter((item) => {
      const gId = item.input.groupId;
      if (gId && entryIds.has(gId)) return false;
      return !item.input.items.some((it) => entryIds.has(it.id));
    });
    store.pending.push({ ...entry, queuedAt: now.toISOString() });
  });
}

function legacyRemovePending(batchOrFollowUpId: string): Promise<void> {
  return updateLegacyStore((store) => {
    store.pending = store.pending.filter((item) => {
      if (item.input.groupId === batchOrFollowUpId) return false;
      return !item.input.items.some((it) => it.id === batchOrFollowUpId);
    });
  });
}

// ---------------------------------------------------------------------------
// API pública con elección automática en tiempo de ejecución
// ---------------------------------------------------------------------------

export async function getDraft(key: string): Promise<FollowUpDraft | null> {
  const db = await tryGetLocalDatabase('follow-up.getDraft');
  if (db) {
    return tryLocalOperation('follow-up.getDraft', () => getDraftInDb(db, key), null);
  }
  return legacyGetDraft(key);
}

export async function saveDraft(
  key: string,
  draft: {
    userId: string;
    childId: string;
    alertId?: string | undefined;
    form: FollowUpFormData;
    lastError?: string | undefined;
  },
  now: Date = new Date(),
): Promise<void> {
  const db = await tryGetLocalDatabase('follow-up.saveDraft');
  if (db) {
    await saveDraftInDb(db, key, draft, now);
    return;
  }
  await legacySaveDraft(key, draft, now);
}

export async function clearDraft(key: string): Promise<void> {
  const db = await tryGetLocalDatabase('follow-up.clearDraft');
  if (db) {
    await clearDraftInDb(db, key);
    return;
  }
  await legacyClearDraft(key);
}

/** Elimina todos los borradores al cerrar sesión; los seguimientos en cola se conservan. */
export async function clearDrafts(): Promise<void> {
  const db = await tryGetLocalDatabase('follow-up.clearDrafts');
  if (db) {
    await clearDraftsInDb(db);
    return;
  }
  await legacyClearDrafts();
}

export async function listPending(userId: string): Promise<PendingFollowUp[]> {
  const db = await tryGetLocalDatabase('follow-up.listPending');
  if (db) {
    return tryLocalOperation(
      'follow-up.listPending',
      () => listPendingFollowUpsInDb(db, userId),
      [],
    );
  }
  return legacyListPending(userId);
}

/** Encola un lote de seguimiento; volver a encolar el mismo lote reemplaza el anterior. */
export async function addPending(
  entry: Omit<PendingFollowUp, 'queuedAt'>,
  now = new Date(),
): Promise<void> {
  const db = await tryGetLocalDatabase('follow-up.addPending');
  if (db) {
    await enqueuePendingFollowUpInDb(db, entry, now);
    return;
  }
  await legacyAddPending(entry, now);
}

export async function removePending(batchOrFollowUpId: string): Promise<void> {
  const db = await tryGetLocalDatabase('follow-up.removePending');
  if (db) {
    await removePendingFollowUpInDb(db, batchOrFollowUpId);
    return;
  }
  await legacyRemovePending(batchOrFollowUpId);
}

/**
 * Obtiene el último seguimiento rechazado definitivamente (`ERROR`) para el niño o alerta,
 * o `null` si se opera sin base local (en modo legado los rechazados vuelven a borradores).
 */
export async function getLatestRejectedFollowUp(
  userId: string,
  target: { alertId?: string | undefined; childId: string },
): Promise<RejectedFollowUpEntry | null> {
  const db = await tryGetLocalDatabase('follow-up.getLatestRejected');
  if (!db) {
    return null;
  }
  return tryLocalOperation(
    'follow-up.getLatestRejected',
    () => getLatestRejectedFollowUpInDb(db, userId, target),
    null,
  );
}

/** Limpia seguimientos en estado `'ERROR'` del objetivo tras guardar un borrador o reenviar. */
export async function clearRejectedFollowUp(
  userId: string,
  target: { alertId?: string | undefined; childId: string },
): Promise<void> {
  const db = await tryGetLocalDatabase('follow-up.clearRejected');
  if (!db) {
    return;
  }
  await tryLocalOperation(
    'follow-up.clearRejected',
    () => clearRejectedFollowUpInDb(db, userId, target),
    undefined,
  );
}
