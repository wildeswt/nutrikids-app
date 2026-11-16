import { ChildResponseSchema, type ChildResponse } from '@nutrikids/shared';
import { nowUtcIso, parseStoredPayload, serializePayload } from './payload-codec.js';
import type { LocalDb } from './types.js';

const TABLE_NAME = 'children';

interface PayloadRow {
  payload: string;
}

/**
 * Inserta o actualiza múltiples niños en caché para un usuario dentro de una transacción.
 */
export async function upsertManyChildren(
  db: LocalDb,
  userId: string,
  children: readonly ChildResponse[],
): Promise<void> {
  if (children.length === 0) {
    return;
  }

  const serializedEntries = children.map((child) => {
    const validated = ChildResponseSchema.parse(child);
    return {
      id: validated.id,
      payload: serializePayload(validated, ChildResponseSchema),
    };
  });

  const updatedAt = nowUtcIso();

  await db.withTransactionAsync(async () => {
    for (const entry of serializedEntries) {
      await db.runAsync(
        `INSERT INTO children (user_id, id, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at;`,
        [userId, entry.id, entry.payload, updatedAt],
      );
    }
  });
}

/**
 * Lista todos los niños almacenados localmente para el usuario indicado.
 * Omite registros cuyo payload no pase la validación de esquema.
 */
export async function listChildren(db: LocalDb, userId: string): Promise<ChildResponse[]> {
  const rows = await db.getAllAsync<PayloadRow>(
    `SELECT payload
     FROM children
     WHERE user_id = ?
     ORDER BY updated_at DESC, id ASC;`,
    [userId],
  );

  const children: ChildResponse[] = [];
  for (const row of rows) {
    const parsed = parseStoredPayload(TABLE_NAME, row.payload, ChildResponseSchema);
    if (parsed !== null) {
      children.push(parsed);
    }
  }
  return children;
}

/**
 * Obtiene un niño por su identificador dentro del alcance del usuario.
 */
export async function getChild(
  db: LocalDb,
  userId: string,
  id: string,
): Promise<ChildResponse | null> {
  const row = await db.getFirstAsync<PayloadRow>(
    `SELECT payload
     FROM children
     WHERE user_id = ? AND id = ?;`,
    [userId, id],
  );

  if (!row) {
    return null;
  }

  return parseStoredPayload(TABLE_NAME, row.payload, ChildResponseSchema);
}

/**
 * Reemplaza atómicamente todo el conjunto de niños del usuario dentro de una transacción
 * (los niños que ya no llegan del servidor, p. ej. desvinculados, se eliminan de la copia local).
 */
export async function replaceAllChildren(
  db: LocalDb,
  userId: string,
  children: readonly ChildResponse[],
  updatedAt: string = nowUtcIso(),
): Promise<void> {
  const serializedEntries = children.map((child) => {
    const validated = ChildResponseSchema.parse(child);
    return {
      id: validated.id,
      payload: serializePayload(validated, ChildResponseSchema),
    };
  });

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM children WHERE user_id = ?;', [userId]);
    for (const entry of serializedEntries) {
      await db.runAsync(
        `INSERT INTO children (user_id, id, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at;`,
        [userId, entry.id, entry.payload, updatedAt],
      );
    }
  });
}

/**
 * Elimina todos los niños en caché del usuario indicado sin afectar a otros usuarios.
 */
export async function clearChildren(db: LocalDb, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM children WHERE user_id = ?;', [userId]);
}

/** Repositorio tipado para la tabla local `children`. */
export const childrenRepository = {
  upsertMany: upsertManyChildren,
  replaceAll: replaceAllChildren,
  list: listChildren,
  get: getChild,
  clear: clearChildren,
};
