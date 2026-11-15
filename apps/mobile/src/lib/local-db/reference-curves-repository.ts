import {
  IndicatorSchema,
  IsoDateTimeSchema,
  OmsReferenceCurvesResponseSchema,
  PositionSchema,
  SexSchema,
  type Indicator,
  type OmsReferenceCurvesResponse,
  type Position,
  type Sex,
} from '@nutrikids/shared';
import { nowUtcIso, parseStoredPayload, serializePayload, toUtcIso } from './payload-codec.js';
import type { LocalDb } from './types.js';

const TABLE_NAME = 'reference_curves';
const DEFAULT_POSITION_KEY = 'NONE';

/** Curva de referencia OMS en caché junto con la marca temporal de obtención (`fetched_at`). */
export interface CachedReferenceCurve {
  curve: OmsReferenceCurvesResponse;
  fetchedAt: string;
}

interface CurveRow {
  payload: string;
  fetched_at: string;
}

function normalizePositionKey(position?: Position | null): string {
  if (position === undefined || position === null) {
    return DEFAULT_POSITION_KEY;
  }
  return PositionSchema.parse(position);
}

/**
 * Obtiene una curva de referencia pública de la OMS por indicador, sexo y posición.
 */
export async function getReferenceCurve(
  db: LocalDb,
  indicator: Indicator,
  sex: Sex,
  position?: Position | null,
): Promise<CachedReferenceCurve | null> {
  const validIndicator = IndicatorSchema.parse(indicator);
  const validSex = SexSchema.parse(sex);
  const positionKey = normalizePositionKey(position);

  const row = await db.getFirstAsync<CurveRow>(
    `SELECT payload, fetched_at
     FROM reference_curves
     WHERE indicator = ? AND sex = ? AND position = ?;`,
    [validIndicator, validSex, positionKey],
  );

  if (!row) {
    return null;
  }

  const parsedCurve = parseStoredPayload(TABLE_NAME, row.payload, OmsReferenceCurvesResponseSchema);
  if (parsedCurve === null) {
    return null;
  }

  const parsedFetchedAt = IsoDateTimeSchema.safeParse(row.fetched_at);
  if (!parsedFetchedAt.success) {
    console.warn(`[local-db] Payload inválido según esquema omitido en tabla ${TABLE_NAME}`);
    return null;
  }

  return {
    curve: parsedCurve,
    fetchedAt: parsedFetchedAt.data,
  };
}

/**
 * Inserta o actualiza una curva de referencia pública de la OMS con su fecha de obtención en UTC.
 */
export async function putReferenceCurve(
  db: LocalDb,
  indicator: Indicator,
  sex: Sex,
  position: Position | null | undefined,
  curve: OmsReferenceCurvesResponse,
  fetchedAt: string = nowUtcIso(),
): Promise<void> {
  const validIndicator = IndicatorSchema.parse(indicator);
  const validSex = SexSchema.parse(sex);
  const positionKey = normalizePositionKey(position);
  const validatedCurve = OmsReferenceCurvesResponseSchema.parse(curve);
  const validatedFetchedAt = toUtcIso(IsoDateTimeSchema.parse(fetchedAt));

  if (validatedCurve.indicator !== validIndicator || validatedCurve.sex !== validSex) {
    throw new Error('La curva de referencia no coincide con el indicador o sexo solicitados.');
  }

  const payload = serializePayload(validatedCurve, OmsReferenceCurvesResponseSchema);

  await db.runAsync(
    `INSERT INTO reference_curves (indicator, sex, position, payload, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(indicator, sex, position) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at;`,
    [validIndicator, validSex, positionKey, payload, validatedFetchedAt],
  );
}

/** Repositorio tipado para la tabla pública local `reference_curves`. */
export const referenceCurvesRepository = {
  get: getReferenceCurve,
  put: putReferenceCurve,
};
