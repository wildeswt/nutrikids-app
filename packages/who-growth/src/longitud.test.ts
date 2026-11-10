import { describe, expect, it } from 'vitest';
import { CORRECCION_LONGITUD_TALLA_CM, ajustarLongitudTalla } from './longitud.js';

describe('ajustarLongitudTalla', () => {
  it('la corrección es 0,7 cm', () => {
    expect(CORRECCION_LONGITUD_TALLA_CM).toBe(0.7);
  });

  it('medido de pie, tabla de longitud: suma 0,7', () => {
    expect(ajustarLongitudTalla(97, 'de_pie', 'acostado')).toBe(97.7);
  });

  it('medido acostado, tabla de talla: resta 0,7', () => {
    expect(ajustarLongitudTalla(97, 'acostado', 'de_pie')).toBe(96.3);
  });

  it('misma posición: sin cambio', () => {
    expect(ajustarLongitudTalla(97, 'de_pie', 'de_pie')).toBe(97);
    expect(ajustarLongitudTalla(97, 'acostado', 'acostado')).toBe(97);
  });

  it('rechaza valores inválidos', () => {
    expect(() => ajustarLongitudTalla(0, 'de_pie', 'acostado')).toThrow(RangeError);
    expect(() => ajustarLongitudTalla(NaN, 'de_pie', 'acostado')).toThrow(RangeError);
  });
});
