import {
  CreateFeedingLogInputSchema,
  CreateFollowUpBatchInputSchema,
  CreateFollowUpInputSchema,
  IsoDateTimeSchema,
  SyncCheckupItemSchema,
  UuidSchema,
  type CreateFeedingLogInput,
  type CreateFollowUpBatchInput,
  type CreateFollowUpInput,
  type SyncCheckupItem,
} from '@nutrikids/shared';
import { z } from 'zod';
import { nowUtcIso, parseStoredPayload, serializePayload, toUtcIso } from './payload-codec.js';
import type { LocalDb, SyncQueueKind, SyncQueueStatus } from './types.js';

const TABLE_NAME = 'sync_queue';

export const SyncFollowUpPayloadSchema = z.union([
  CreateFollowUpInputSchema.extend({ childId: UuidSchema }),
  CreateFollowUpBatchInputSchema.extend({ childId: UuidSchema }),
  CreateFollowUpInputSchema,
  CreateFollowUpBatchInputSchema,
]);
export type SyncFollowUpWithChild = CreateFollowUpInput & { childId: string };
export type SyncFollowUpBatchWithChild = CreateFollowUpBatchInput & { childId: string };

export type SyncFollowUpPayload =
  | SyncFollowUpWithChild
  | SyncFollowUpBatchWithChild
  | CreateFollowUpInput
  | CreateFollowUpBatchInput;

export const SyncFeedingPayloadSchema = z.union([
  CreateFeedingLogInputSchema.extend({ childId: UuidSchema }),
  CreateFeedingLogInputSchema,
]);
export type SyncFeedingWithChild = CreateFeedingLogInput & { childId: string };
export type SyncFeedingPayload = SyncFeedingWithChild | CreateFeedingLogInput;

const SyncQueueKindSchema = z.enum(['checkup', 'follow-up', 'feeding']);
const SyncQueueStatusSchema = z.enum(['LOCAL', 'SENDING', 'SENT', 'ERROR']);

/** Entrada discriminada por `kind` para encolar una operación sin conexión. */
export type EnqueueSyncItemInput =
  | {
      id?: string;
      kind: 'checkup';
      payload: SyncCheckupItem;
      nextAttemptAt?: string | null;
    }
  | {
      id?: string;
      kind: 'follow-up';
      payload: SyncFollowUpPayload;
      nextAttemptAt?: string | null;
    }
  | {
      id?: string;
      kind: 'feeding';
      payload: SyncFeedingPayload;
      nextAttemptAt?: string | null;
    };

type SyncQueuePayloadVariant =
  | { kind: 'checkup'; payload: SyncCheckupItem }
  | { kind: 'follow-up'; payload: SyncFollowUpPayload }
  | { kind: 'feeding'; payload: SyncFeedingPayload };

/** Registro validado leído desde la tabla `sync_queue`. */
export type SyncQueueRecord = SyncQueuePayloadVariant & {
  id: string;
  userId: string;
  status: SyncQueueStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Campos opcionales actualizables al cambiar el estado de un elemento en cola. */
export interface UpdateSyncQueueStatusOptions {
  attempts?: number;
  nextAttemptAt?: string | null;
  lastError?: string | null;
}

interface SyncQueueRow {
  id: string;
  user_id: string;
  kind: string;
  payload: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function generateId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  throw new Error('crypto.randomUUID no está disponible para identificar el elemento en cola.');
}

function parseRow(row: SyncQueueRow): SyncQueueRecord | null {
  const kindParsed = SyncQueueKindSchema.safeParse(row.kind);
  const statusParsed = SyncQueueStatusSchema.safeParse(row.status);
  if (!kindParsed.success || !statusParsed.success) {
    console.warn(`[local-db] Payload inválido según esquema omitido en tabla ${TABLE_NAME}`);
    return null;
  }

  const base = {
    id: row.id,
    userId: row.user_id,
    status: statusParsed.data,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const kind: SyncQueueKind = kindParsed.data;
  if (kind === 'checkup') {
    const payload = parseStoredPayload(TABLE_NAME, row.payload, SyncCheckupItemSchema);
    return payload ? { ...base, kind: 'checkup', payload } : null;
  }

  if (kind === 'follow-up') {
    const payload = parseStoredPayload(TABLE_NAME, row.payload, SyncFollowUpPayloadSchema);
    return payload ? { ...base, kind: 'follow-up', payload } : null;
  }

  const payload = parseStoredPayload(TABLE_NAME, row.payload, SyncFeedingPayloadSchema);
  return payload ? { ...base, kind: 'feeding', payload } : null;
}

function validateAndSerializeInput(input: EnqueueSyncItemInput): {
  id: string;
  kind: SyncQueueKind;
  serializedPayload: string;
  validatedPayload: SyncCheckupItem | SyncFollowUpPayload | SyncFeedingPayload;
} {
  if (input.kind === 'checkup') {
    const validated = SyncCheckupItemSchema.parse(input.payload);
    return {
      id: input.id ? UuidSchema.parse(input.id) : validated.id,
      kind: 'checkup',
      serializedPayload: serializePayload(validated, SyncCheckupItemSchema),
      validatedPayload: validated,
    };
  }

  if (input.kind === 'follow-up') {
    const validated = SyncFollowUpPayloadSchema.parse(input.payload);
    const derivedId = 'id' in validated ? validated.id : generateId();
    return {
      id: input.id ? UuidSchema.parse(input.id) : derivedId,
      kind: 'follow-up',
      serializedPayload: serializePayload(validated, SyncFollowUpPayloadSchema),
      validatedPayload: validated,
    };
  }

  const validated = SyncFeedingPayloadSchema.parse(input.payload);
  return {
    id: input.id ? UuidSchema.parse(input.id) : validated.id,
    kind: 'feeding',
    serializedPayload: serializePayload(validated, SyncFeedingPayloadSchema),
    validatedPayload: validated,
  };
}

/**
 * Inserta un elemento en `sync_queue` con estado inicial `'LOCAL'` y 0 intentos.
 */
export async function enqueueSyncItem(
  db: LocalDb,
  userId: string,
  input: EnqueueSyncItemInput,
): Promise<SyncQueueRecord> {
  const { id, kind, serializedPayload, validatedPayload } = validateAndSerializeInput(input);
  const nextAttemptAt =
    input.nextAttemptAt === undefined || input.nextAttemptAt === null
      ? null
      : toUtcIso(IsoDateTimeSchema.parse(input.nextAttemptAt));
  const now = nowUtcIso();

  await db.runAsync(
    `INSERT INTO sync_queue (
       id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, 'LOCAL', 0, ?, NULL, ?, ?);`,
    [id, userId, kind, serializedPayload, nextAttemptAt, now, now],
  );

  return {
    id,
    userId,
    kind,
    payload: validatedPayload,
    status: 'LOCAL',
    attempts: 0,
    nextAttemptAt,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  } as SyncQueueRecord;
}

/**
 * Lista los elementos en cola del usuario filtrados por estado.
 */
export async function listSyncItemsByStatus(
  db: LocalDb,
  userId: string,
  status: SyncQueueStatus,
): Promise<SyncQueueRecord[]> {
  const validStatus = SyncQueueStatusSchema.parse(status);
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
     FROM sync_queue
     WHERE user_id = ? AND status = ?
     ORDER BY created_at ASC, id ASC;`,
    [userId, validStatus],
  );

  const records: SyncQueueRecord[] = [];
  for (const row of rows) {
    const parsed = parseRow(row);
    if (parsed !== null) {
      records.push(parsed);
    }
  }
  return records;
}

/**
 * Lista los elementos `'LOCAL'` del usuario cuya fecha programada ya venció (`next_attempt_at IS NULL OR next_attempt_at <= now`).
 */
export async function listDueSyncItems(
  db: LocalDb,
  userId: string,
  now: string = nowUtcIso(),
): Promise<SyncQueueRecord[]> {
  const normalizedNow = toUtcIso(IsoDateTimeSchema.parse(now));
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
     FROM sync_queue
     WHERE user_id = ?
       AND status = 'LOCAL'
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY
       CASE WHEN next_attempt_at IS NULL THEN 0 ELSE 1 END ASC,
       next_attempt_at ASC,
       created_at ASC,
       id ASC;`,
    [userId, normalizedNow],
  );

  const records: SyncQueueRecord[] = [];
  for (const row of rows) {
    const parsed = parseRow(row);
    if (parsed !== null) {
      records.push(parsed);
    }
  }
  return records;
}

/**
 * Actualiza el estado y metadatos de programación de un elemento en cola del usuario.
 */
export async function updateSyncItemStatus(
  db: LocalDb,
  userId: string,
  id: string,
  status: SyncQueueStatus,
  options: UpdateSyncQueueStatusOptions = {},
): Promise<boolean> {
  const validStatus = SyncQueueStatusSchema.parse(status);
  const assignments: string[] = ['status = ?', 'updated_at = ?'];
  const params: Array<string | number | null> = [validStatus, nowUtcIso()];

  if (options.attempts !== undefined) {
    if (!Number.isInteger(options.attempts) || options.attempts < 0) {
      throw new Error('El contador de intentos debe ser un entero no negativo.');
    }
    assignments.push('attempts = ?');
    params.push(options.attempts);
  }

  if ('nextAttemptAt' in options) {
    const normalizedNext =
      options.nextAttemptAt === null || options.nextAttemptAt === undefined
        ? null
        : toUtcIso(IsoDateTimeSchema.parse(options.nextAttemptAt));
    assignments.push('next_attempt_at = ?');
    params.push(normalizedNext);
  }

  if ('lastError' in options) {
    assignments.push('last_error = ?');
    params.push(options.lastError ?? null);
  }

  params.push(userId, id);

  const result = await db.runAsync(
    `UPDATE sync_queue
     SET ${assignments.join(', ')}
     WHERE user_id = ? AND id = ?;`,
    params,
  );
  return result.changes > 0;
}

/**
 * Cuenta los elementos pendientes de sincronizar (`LOCAL` o `SENDING`) del usuario indicado.
 */
export async function countPendingSyncItems(db: LocalDb, userId: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM sync_queue
     WHERE user_id = ? AND status IN ('LOCAL', 'SENDING');`,
    [userId],
  );
  return row ? Number(row.total) : 0;
}

/**
 * Obtiene un elemento de `sync_queue` por su identificador dentro del alcance del usuario.
 */
export async function getSyncItemById(
  db: LocalDb,
  userId: string,
  id: string,
): Promise<SyncQueueRecord | null> {
  const row = await db.getFirstAsync<SyncQueueRow>(
    `SELECT id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
     FROM sync_queue
     WHERE user_id = ? AND id = ?;`,
    [userId, id],
  );
  return row ? parseRow(row) : null;
}

/**
 * Lista los controles pendientes (`LOCAL`, `SENDING`, `ERROR`) y los enviados (`SENT`)
 * desde `sentSinceIso` (p. ej. últimas 24 horas) para la pantalla «Pendientes de envío».
 */
export async function listCheckupsWithRecentSent(
  db: LocalDb,
  userId: string,
  sentSinceIso: string,
): Promise<Array<Extract<SyncQueueRecord, { kind: 'checkup' }>>> {
  const normalizedSince = toUtcIso(IsoDateTimeSchema.parse(sentSinceIso));
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT id, user_id, kind, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at
     FROM sync_queue
     WHERE user_id = ?
       AND kind = 'checkup'
       AND (
         status IN ('LOCAL', 'SENDING', 'ERROR')
         OR (status = 'SENT' AND updated_at >= ?)
       )
     ORDER BY
       CASE status WHEN 'SENT' THEN 1 ELSE 0 END ASC,
       created_at DESC,
       id ASC;`,
    [userId, normalizedSince],
  );

  const records: Array<Extract<SyncQueueRecord, { kind: 'checkup' }>> = [];
  for (const row of rows) {
    const parsed = parseRow(row);
    if (parsed !== null && parsed.kind === 'checkup') {
      records.push(parsed);
    }
  }
  return records;
}

/**
 * Elimina un elemento de `sync_queue` perteneciente al usuario indicado.
 */
export async function removeSyncItem(db: LocalDb, userId: string, id: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM sync_queue WHERE user_id = ? AND id = ?;', [
    userId,
    id,
  ]);
  return result.changes > 0;
}

/** Repositorio tipado para la tabla local `sync_queue`. */
export const syncQueueRepository = {
  enqueue: enqueueSyncItem,
  getById: getSyncItemById,
  listByStatus: listSyncItemsByStatus,
  listDue: listDueSyncItems,
  listCheckupsWithRecentSent,
  updateStatus: updateSyncItemStatus,
  countPending: countPendingSyncItems,
  remove: removeSyncItem,
};
