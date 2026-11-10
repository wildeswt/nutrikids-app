import { describe, expect, it } from 'vitest';
import { edadEnMeses } from './edad.js';

describe('edadEnMeses', () => {
  it('cumpleaños exacto', () => {
    expect(edadEnMeses('2023-01-15', '2024-01-15')).toBe(12);
  });

  it('un día antes del mes cumplido', () => {
    expect(edadEnMeses('2023-01-15', '2024-01-14')).toBe(11);
  });

  it('mismo día = 0 meses', () => {
    expect(edadEnMeses('2024-05-10', '2024-05-10')).toBe(0);
  });

  it('cruza años', () => {
    expect(edadEnMeses('2021-11-20', '2024-02-25')).toBe(27);
  });

  it('nacido a fin de mes', () => {
    expect(edadEnMeses('2024-01-31', '2024-02-29')).toBe(0);
    expect(edadEnMeses('2024-01-31', '2024-03-31')).toBe(2);
  });

  it('acepta Date (UTC)', () => {
    expect(edadEnMeses(new Date(Date.UTC(2023, 0, 15)), new Date(Date.UTC(2024, 6, 15)))).toBe(18);
  });

  it('rechaza control anterior al nacimiento', () => {
    expect(() => edadEnMeses('2024-01-02', '2024-01-01')).toThrow(RangeError);
  });

  it('rechaza fechas inválidas', () => {
    expect(() => edadEnMeses('2024-02-30', '2024-03-01')).toThrow(RangeError);
    expect(() => edadEnMeses('hola', '2024-03-01')).toThrow(RangeError);
    expect(() => edadEnMeses(new Date('x'), '2024-03-01')).toThrow(RangeError);
  });
});
