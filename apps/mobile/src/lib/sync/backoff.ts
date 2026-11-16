/** Espera base para el primer reintento de sincronización (1 segundo). */
export const BASE_BACKOFF_MS = 1_000;

/** Tope máximo de espera entre reintentos (5 minutos). */
export const MAX_BACKOFF_MS = 5 * 60 * 1_000;

/** Variación aleatoria (±20 %) aplicada para evitar tormentas de reintentos simultáneos. */
export const BACKOFF_JITTER_RATIO = 0.2;

/**
 * Calcula el tiempo de espera en milisegundos para el siguiente reintento:
 * 1 s, 2 s, 4 s, 8 s… con tope de 5 minutos y una variación aleatoria de ±20 %.
 */
export function computeBackoffMs(attempts: number, random: () => number = Math.random): number {
  const normalizedAttempts = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
  const exponent = Math.min(normalizedAttempts, 30);
  const baseDelayMs = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);

  const rawRandom = random();
  const clampedRandom = Number.isFinite(rawRandom) ? Math.min(1, Math.max(0, rawRandom)) : 0.5;
  const jitterFactor = 1 + (clampedRandom * 2 - 1) * BACKOFF_JITTER_RATIO;

  return Math.min(MAX_BACKOFF_MS, Math.round(baseDelayMs * jitterFactor));
}
