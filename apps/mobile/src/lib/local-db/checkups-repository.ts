import {
  CaregiverCheckupResponseSchema,
  CheckupResponseSchema,
  SyncCheckupItemSchema,
  type CaregiverCheckupResponse,
  type CheckupResponse,
  type SyncCheckupItem,
} from '@nutrikids/shared';
import { z } from 'zod';
import { nowUtcIso, parseStoredPayload, serializePayload, toUtcIso } from './payload-codec.js';
import type { LocalDb, SyncCheckupState } from './types.js';

const TABLE_NAME = 'checkups';

/**
 * Respuesta de control proveniente del servidor (vista profesional con `results`
 * primero para evitar que el esquema de cuidador recorte los indicadores).
 */
export const ServerCheckupSchema = z.union([CheckupResponseSchema, CaregiverCheckupResponseSchema]);
export type ServerCheckup = CheckupResponse | CaregiverCheckupResponse;

/**
 * Unión de formatos válidos almacenables en la tabla `checkups`:
 * controles sincronizados del servidor o controles creados localmente sin conexión.
 */
export const StoredCheckupSchema = z.union([
  CheckupResponseSchema,
  CaregiverCheckupResponseSchema,
  SyncCheckupItemSchema,
]);
export type StoredCheckup = CheckupResponse | CaregiverCheckupResponse | SyncCheckupItem;

/** Control almacenado localmente junto con su estado de sincronización y fecha de creación. */
export interface CheckupEntry {
  checkup: StoredCheckup;
  syncState: SyncCheckupState;
  createdAt: string;
}

interface PayloadRow {
  payload: string;
}

interface CheckupEntryRow {
  payload: string;
  sync_state: SyncCheckupState;
  created_at: string;
}

/**
 * Inserta o actualiza múltiples controles recibidos del servidor (`sync_state = 'SENT'`).
 */
export async function upsertManyCheckups(
  db: LocalDb,
  userId: string,
  checkups: readonly ServerCheckup[],
): Promise<void> {
  if (checkups.length === 0) {
    return;
  }

  const prepared = checkups.map((checkup) => {
    const validated = ServerCheckupSchema.parse(checkup);
    return {
      id: validated.id,
      childId: validated.childId,
      measuredAt: toUtcIso(validated.measuredAt),
      createdAt: toUtcIso(validated.createdAt),
      payload: serializePayload(validated, ServerCheckupSchema),
    };
  });

  await db.withTransactionAsync(async () => {
    for (const item of prepared) {
      await db.runAsync(
        `INSERT INTO checkups (
           user_id, id, child_id, measured_at, payload, sync_state, created_at
         )
         VALUES (?, ?, ?, ?, ?, 'SENT', ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           child_id = excluded.child_id,
           measured_at = excluded.measured_at,
           payload = excluded.payload,
           sync_state = 'SENT',
           created_at = excluded.created_at;`,
        [userId, item.id, item.childId, item.measuredAt, item.payload, item.createdAt],
      );
    }
  });
}

/**
 * Lista los controles de un niño para el usuario indicado, ordenados del más reciente al más antiguo.
 */
export async function listCheckupsByChild(
  db: LocalDb,
  userId: string,
  childId: string,
): Promise<StoredCheckup[]> {
  const rows = await db.getAllAsync<PayloadRow>(
    `SELECT payload
     FROM checkups
     WHERE user_id = ? AND child_id = ?
     ORDER BY measured_at DESC, created_at DESC, id ASC;`,
    [userId, childId],
  );

  const checkups: StoredCheckup[] = [];
  for (const row of rows) {
    const parsed = parseStoredPayload(TABLE_NAME, row.payload, StoredCheckupSchema);
    if (parsed !== null) {
      checkups.push(parsed);
    }
  }
  return checkups;
}

/**
 * Guarda un control creado sin conexión con estado `sync_state = 'LOCAL'`.
 */
export async function insertLocalCheckup(
  db: LocalDb,
  userId: string,
  checkup: StoredCheckup,
): Promise<void> {
  const validated = StoredCheckupSchema.parse(checkup);
  const payload = serializePayload(validated, StoredCheckupSchema);
  const measuredAt = toUtcIso(validated.measuredAt);
  const createdAt = 'createdAt' in validated ? toUtcIso(validated.createdAt) : nowUtcIso();

  await db.runAsync(
    `INSERT INTO checkups (
       user_id, id, child_id, measured_at, payload, sync_state, created_at
     )
     VALUES (?, ?, ?, ?, ?, 'LOCAL', ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
       child_id = excluded.child_id,
       measured_at = excluded.measured_at,
       payload = excluded.payload,
       sync_state = 'LOCAL',
       created_at = excluded.created_at;`,
    [userId, validated.id, validated.childId, measuredAt, payload, createdAt],
  );
}

/**
 * Reemplaza el registro local (`localId`) con la respuesta definitiva del servidor y lo marca `'SENT'`.
 */
export async function markCheckupSent(
  db: LocalDb,
  userId: string,
  localId: string,
  serverCheckup: ServerCheckup,
): Promise<void> {
  const validated = ServerCheckupSchema.parse(serverCheckup);
  const payload = serializePayload(validated, ServerCheckupSchema);
  const measuredAt = toUtcIso(validated.measuredAt);
  const createdAt = toUtcIso(validated.createdAt);

  await db.withTransactionAsync(async () => {
    if (validated.id !== localId) {
      await db.runAsync('DELETE FROM checkups WHERE user_id = ? AND id = ?;', [userId, localId]);
    }

    await db.runAsync(
      `INSERT INTO checkups (
         user_id, id, child_id, measured_at, payload, sync_state, created_at
       )
       VALUES (?, ?, ?, ?, ?, 'SENT', ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         child_id = excluded.child_id,
         measured_at = excluded.measured_at,
         payload = excluded.payload,
         sync_state = 'SENT',
         created_at = excluded.created_at;`,
      [userId, validated.id, validated.childId, measuredAt, payload, createdAt],
    );
  });
}

/**
 * Elimina un control local del usuario indicado.
 */
export async function deleteCheckup(db: LocalDb, userId: string, id: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM checkups WHERE user_id = ? AND id = ?;', [
    userId,
    id,
  ]);
  return result.changes > 0;
}

/**
 * Elimina un control pendiente (`sync_state = 'LOCAL'`) del usuario indicado sin afectar
 * controles ya confirmados por el servidor (`SENT`).
 */
export async function deleteLocalOnlyCheckup(
  db: LocalDb,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db.runAsync(
    "DELETE FROM checkups WHERE user_id = ? AND id = ? AND sync_state = 'LOCAL';",
    [userId, id],
  );
  return result.changes > 0;
}

/**
 * Lista los controles de un niño con su `sync_state`, ordenados del más reciente al más antiguo.
 */
export async function listCheckupEntriesByChild(
  db: LocalDb,
  userId: string,
  childId: string,
): Promise<CheckupEntry[]> {
  const rows = await db.getAllAsync<CheckupEntryRow>(
    `SELECT payload, sync_state, created_at
     FROM checkups
     WHERE user_id = ? AND child_id = ?
     ORDER BY measured_at DESC, created_at DESC, id ASC;`,
    [userId, childId],
  );

  const entries: CheckupEntry[] = [];
  for (const row of rows) {
    const parsed = parseStoredPayload(TABLE_NAME, row.payload, StoredCheckupSchema);
    if (parsed !== null) {
      entries.push({
        checkup: parsed,
        syncState: row.sync_state,
        createdAt: row.created_at,
      });
    }
  }
  return entries;
}

/**
 * Reemplaza atómicamente en transacción los controles `'SENT'` de un niño para el usuario dado,
 * conservando intactos los controles locales pendientes de envío (`sync_state = 'LOCAL'`).
 */
export async function replaceSentCheckupsForChild(
  db: LocalDb,
  userId: string,
  childId: string,
  checkups: readonly ServerCheckup[],
): Promise<void> {
  const prepared = checkups.map((checkup) => {
    const validated = ServerCheckupSchema.parse(checkup);
    return {
      id: validated.id,
      childId: validated.childId,
      measuredAt: toUtcIso(validated.measuredAt),
      createdAt: toUtcIso(validated.createdAt),
      payload: serializePayload(validated, ServerCheckupSchema),
    };
  });

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM checkups WHERE user_id = ? AND child_id = ? AND sync_state = 'SENT';",
      [userId, childId],
    );

    for (const item of prepared) {
      await db.runAsync(
        `INSERT INTO checkups (
           user_id, id, child_id, measured_at, payload, sync_state, created_at
         )
         VALUES (?, ?, ?, ?, ?, 'SENT', ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           child_id = excluded.child_id,
           measured_at = excluded.measured_at,
           payload = excluded.payload,
           sync_state = 'SENT',
           created_at = excluded.created_at;`,
        [userId, item.id, item.childId, item.measuredAt, item.payload, item.createdAt],
      );
    }
  });
}

/**
 * Elimina los controles `'SENT'` en caché de un niño (usado cuando el servidor responde 403/404).
 */
export async function deleteSentCheckupsForChild(
  db: LocalDb,
  userId: string,
  childId: string,
): Promise<void> {
  await db.runAsync(
    "DELETE FROM checkups WHERE user_id = ? AND child_id = ? AND sync_state = 'SENT';",
    [userId, childId],
  );
}

/** Repositorio tipado para la tabla local `checkups`. */
export const checkupsRepository = {
  upsertMany: upsertManyCheckups,
  replaceSentByChild: replaceSentCheckupsForChild,
  listByChild: listCheckupsByChild,
  listEntriesByChild: listCheckupEntriesByChild,
  insertLocal: insertLocalCheckup,
  markSent: markCheckupSent,
  delete: deleteCheckup,
  deleteLocal: deleteLocalOnlyCheckup,
  deleteSentByChild: deleteSentCheckupsForChild,
};
