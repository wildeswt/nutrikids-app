import type { z } from 'zod';

/** Devuelve la fecha y hora actual en formato ISO 8601 UTC. */
export function nowUtcIso(): string {
  return new Date().toISOString();
}

/** Normaliza una fecha ISO 8601 (con zona u offset) a ISO 8601 UTC para índices ordenables. */
export function toUtcIso(isoDateTime: string): string {
  const timestamp = Date.parse(isoDateTime);
  if (Number.isNaN(timestamp)) {
    throw new Error('La marca de tiempo no es una fecha ISO 8601 válida.');
  }
  return new Date(timestamp).toISOString();
}

/**
 * Valida y serializa un objeto contra un esquema de Zod antes de persistirlo en JSON.
 */
export function serializePayload<T>(value: T, schema: z.ZodType<T>): string {
  const validated = schema.parse(value);
  return JSON.stringify(validated);
}

/**
 * Parsea y valida un `payload` JSON leído desde SQLite.
 * Si el JSON está corrupto o no cumple el esquema, omite el registro y registra solo la tabla
 * (nunca datos personales ni contenido clínico).
 */
export function parseStoredPayload<T>(
  tableName: string,
  rawPayload: string,
  schema: z.ZodType<T>,
): T | null {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload);
  } catch {
    console.warn(`[local-db] Payload JSON inválido omitido en tabla ${tableName}`);
    return null;
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    console.warn(`[local-db] Payload inválido según esquema omitido en tabla ${tableName}`);
    return null;
  }

  return result.data;
}
