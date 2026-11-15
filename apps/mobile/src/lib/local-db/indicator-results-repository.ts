import {
  CaregiverIndicatorResultSchema,
  IndicatorResultSchema,
  type CaregiverIndicatorResult,
  type IndicatorResult,
} from '@nutrikids/shared';
import { z } from 'zod';
import { parseStoredPayload, serializePayload } from './payload-codec.js';
import type { LocalDb } from './types.js';

const TABLE_NAME = 'indicator_results';

/**
 * Resultado de indicador en formato profesional (con z-score/percentil/clasificación)
 * o formato cuidador (RF-14). El esquema profesional va primero para conservar todos los campos.
 */
export const StoredIndicatorResultSchema = z.union([
  IndicatorResultSchema,
  CaregiverIndicatorResultSchema,
]);
export type StoredIndicatorResult = IndicatorResult | CaregiverIndicatorResult;

interface PayloadRow {
  payload: string;
}

/**
 * Reemplaza atómicamente los resultados de indicadores almacenados para un control del usuario.
 */
export async function replaceIndicatorResultsForCheckup(
  db: LocalDb,
  userId: string,
  checkupId: string,
  results: readonly StoredIndicatorResult[],
): Promise<void> {
  const prepared = results.map((item) => {
    const validated = StoredIndicatorResultSchema.parse(item);
    if (validated.checkupId !== checkupId) {
      throw new Error('El resultado de indicador no corresponde al control especificado.');
    }
    return {
      indicator: validated.indicator,
      payload: serializePayload(validated, StoredIndicatorResultSchema),
    };
  });

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM indicator_results WHERE user_id = ? AND checkup_id = ?;', [
      userId,
      checkupId,
    ]);

    for (const entry of prepared) {
      await db.runAsync(
        `INSERT INTO indicator_results (user_id, checkup_id, indicator, payload)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, checkup_id, indicator) DO UPDATE SET
           payload = excluded.payload;`,
        [userId, checkupId, entry.indicator, entry.payload],
      );
    }
  });
}

/**
 * Lista los resultados de indicadores almacenados para un control y usuario dados.
 */
export async function listIndicatorResultsForCheckup(
  db: LocalDb,
  userId: string,
  checkupId: string,
): Promise<StoredIndicatorResult[]> {
  const rows = await db.getAllAsync<PayloadRow>(
    `SELECT payload
     FROM indicator_results
     WHERE user_id = ? AND checkup_id = ?
     ORDER BY indicator ASC;`,
    [userId, checkupId],
  );

  const results: StoredIndicatorResult[] = [];
  for (const row of rows) {
    const parsed = parseStoredPayload(TABLE_NAME, row.payload, StoredIndicatorResultSchema);
    if (parsed !== null) {
      results.push(parsed);
    }
  }
  return results;
}

/** Repositorio tipado para la tabla local `indicator_results`. */
export const indicatorResultsRepository = {
  replaceForCheckup: replaceIndicatorResultsForCheckup,
  listForCheckup: listIndicatorResultsForCheckup,
};
