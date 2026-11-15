import { describe, expect, it } from 'vitest';
import { BASE_BACKOFF_MS, MAX_BACKOFF_MS, computeBackoffMs } from '../lib/sync/backoff.js';

describe('computeBackoffMs', () => {
  it('duplica la espera desde 1 s (1 s, 2 s, 4 s, 8 s...) sin jitter cuando random = 0.5', () => {
    const neutralRandom = () => 0.5;

    expect(computeBackoffMs(0, neutralRandom)).toBe(1_000);
    expect(computeBackoffMs(1, neutralRandom)).toBe(2_000);
    expect(computeBackoffMs(2, neutralRandom)).toBe(4_000);
    expect(computeBackoffMs(3, neutralRandom)).toBe(8_000);
    expect(computeBackoffMs(4, neutralRandom)).toBe(16_000);
    expect(computeBackoffMs(5, neutralRandom)).toBe(32_000);
    expect(computeBackoffMs(6, neutralRandom)).toBe(64_000);
    expect(computeBackoffMs(7, neutralRandom)).toBe(128_000);
    expect(computeBackoffMs(8, neutralRandom)).toBe(256_000);
  });

  it('aplica el tope máximo de 5 minutos (300 000 ms)', () => {
    const neutralRandom = () => 0.5;

    expect(computeBackoffMs(9, neutralRandom)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffMs(15, neutralRandom)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffMs(100, neutralRandom)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffMs(100, () => 1)).toBe(MAX_BACKOFF_MS);
  });

  it('aplica variación aleatoria de ±20 %', () => {
    expect(computeBackoffMs(0, () => 0)).toBe(BASE_BACKOFF_MS * 0.8);
    expect(computeBackoffMs(0, () => 1)).toBe(BASE_BACKOFF_MS * 1.2);
    expect(computeBackoffMs(2, () => 0)).toBe(4_000 * 0.8);
    expect(computeBackoffMs(2, () => 1)).toBe(4_000 * 1.2);
    expect(computeBackoffMs(20, () => 0)).toBe(MAX_BACKOFF_MS * 0.8);
  });

  it('normaliza intentos negativos o no finitos al mínimo de 1 s base', () => {
    expect(computeBackoffMs(-3, () => 0.5)).toBe(BASE_BACKOFF_MS);
    expect(computeBackoffMs(Number.NaN, () => 0.5)).toBe(BASE_BACKOFF_MS);
  });
});
