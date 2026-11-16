import { describe, expect, it } from 'vitest';

import { formatElapsedTime } from '../lib/relative-time';

describe('formatElapsedTime', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');

  it('muestra menos de un minuto cuando han pasado menos de 60 segundos', () => {
    expect(formatElapsedTime('2026-11-14T11:59:30.000Z', now)).toBe('menos de 1 minuto');
    expect(formatElapsedTime('2026-11-14T12:00:00.000Z', now)).toBe('menos de 1 minuto');
  });

  it('formatea singular y plural en minutos', () => {
    expect(formatElapsedTime('2026-11-14T11:59:00.000Z', now)).toBe('1 minuto');
    expect(formatElapsedTime('2026-11-14T11:45:00.000Z', now)).toBe('15 minutos');
    expect(formatElapsedTime('2026-11-14T11:01:00.000Z', now)).toBe('59 minutos');
  });

  it('formatea singular y plural en horas', () => {
    expect(formatElapsedTime('2026-11-14T11:00:00.000Z', now)).toBe('1 hora');
    expect(formatElapsedTime('2026-11-14T07:00:00.000Z', now)).toBe('5 horas');
    expect(formatElapsedTime('2026-11-13T13:00:00.000Z', now)).toBe('23 horas');
  });

  it('formatea singular y plural en días', () => {
    expect(formatElapsedTime('2026-11-13T12:00:00.000Z', now)).toBe('1 día');
    expect(formatElapsedTime('2026-11-11T12:00:00.000Z', now)).toBe('3 días');
  });

  it('maneja fechas futuras o inválidas de forma segura', () => {
    expect(formatElapsedTime('2026-11-14T13:00:00.000Z', now)).toBe('menos de 1 minuto');
    expect(formatElapsedTime('fecha-invalida', now)).toBe('menos de 1 minuto');
  });
});
