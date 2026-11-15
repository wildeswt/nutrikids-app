/** Duración (en ms) durante la cual se muestra el estado transitorio «Todo sincronizado». */
export const SYNCED_BANNER_DURATION_MS = 3_000;

/** Estado visual posible de la barra de conexión siempre visible. */
export type ConnectionBarKind = 'offline' | 'sending' | 'error' | 'synced' | 'hidden';

/** Entradas necesarias para derivar el estado visual de la barra de conexión. */
export interface DeriveConnectionBarInput {
  isOnline: boolean;
  pending: number;
  sending: number;
  error: number;
  justSynced: boolean;
}

/** Estado derivado de la barra de conexión y conteo asociado al estado actual. */
export interface ConnectionBarState {
  kind: ConnectionBarKind;
  count: number;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

/**
 * Deriva el estado y conteo de la barra de conexión respetando la prioridad:
 * `offline` > `error` > `sending` > `synced` > `hidden`.
 */
export function deriveConnectionBarState(input: DeriveConnectionBarInput): ConnectionBarState {
  const pending = normalizeCount(input.pending);
  const sending = normalizeCount(input.sending);
  const error = normalizeCount(input.error);

  if (!input.isOnline) {
    return {
      kind: 'offline',
      count: pending + sending + error,
    };
  }

  if (error > 0) {
    return {
      kind: 'error',
      count: error,
    };
  }

  if (sending > 0 || pending > 0) {
    return {
      kind: 'sending',
      count: sending + pending,
    };
  }

  if (input.justSynced) {
    return {
      kind: 'synced',
      count: 0,
    };
  }

  return {
    kind: 'hidden',
    count: 0,
  };
}
