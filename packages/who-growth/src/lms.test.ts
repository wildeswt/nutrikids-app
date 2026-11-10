import { describe, expect, it } from 'vitest';
import { CURVAS_Z, calcularZ, curvasZ, medidaDesdeZ, percentilDesdeZ } from './lms.js';

describe('calcularZ', () => {
  it('L ≠ 0: ((x/M)^L - 1) / (L·S)', () => {
    // (110/100)^-0.5 = 0.953463; (0.953463-1)/(-0.5*0.1) = 0.93074
    expect(calcularZ(110, -0.5, 100, 0.1)).toBeCloseTo(0.93074, 4);
  });

  it('L = 0: ln(x/M) / S', () => {
    expect(calcularZ(110, 0, 100, 0.1)).toBeCloseTo(Math.log(1.1) / 0.1, 10);
  });

  it('x = M da z = 0', () => {
    expect(calcularZ(100, 0, 100, 0.1)).toBe(0);
    expect(calcularZ(100, 1.2, 100, 0.1)).toBe(0);
  });

  it('L → 0 converge al caso logarítmico', () => {
    expect(calcularZ(110, 1e-9, 100, 0.1)).toBeCloseTo(calcularZ(110, 0, 100, 0.1), 5);
  });

  it('rechaza entradas inválidas', () => {
    expect(() => calcularZ(0, 0, 100, 0.1)).toThrow(RangeError);
    expect(() => calcularZ(-1, 0, 100, 0.1)).toThrow(RangeError);
    expect(() => calcularZ(NaN, 0, 100, 0.1)).toThrow(RangeError);
    expect(() => calcularZ(10, 0, 0, 0.1)).toThrow(RangeError);
    expect(() => calcularZ(10, 0, 100, 0)).toThrow(RangeError);
    expect(() => calcularZ(10, Infinity, 100, 0.1)).toThrow(RangeError);
  });
});

describe('medidaDesdeZ y ida y vuelta', () => {
  const casos = [
    { nombre: 'L = 0', L: 0, M: 15, S: 0.08 },
    { nombre: 'L < 0', L: -0.3521, M: 14.5, S: 0.0825 },
    { nombre: 'L > 0', L: 1.2, M: 90, S: 0.04 },
  ];

  for (const { nombre, L, M, S } of casos) {
    describe(nombre, () => {
      it('z = 0 devuelve M', () => {
        expect(medidaDesdeZ(0, L, M, S)).toBeCloseTo(M, 10);
      });

      for (const z of CURVAS_Z) {
        it(`calcularZ(medidaDesdeZ(${z})) ≈ ${z}`, () => {
          expect(calcularZ(medidaDesdeZ(z, L, M, S), L, M, S)).toBeCloseTo(z, 9);
        });
      }

      it('medidaDesdeZ(calcularZ(x)) ≈ x', () => {
        for (const x of [M * 0.7, M * 0.9, M, M * 1.1, M * 1.3]) {
          expect(medidaDesdeZ(calcularZ(x, L, M, S), L, M, S)).toBeCloseTo(x, 9);
        }
      });

      it('curvasZ crece con z', () => {
        const c = curvasZ(L, M, S);
        expect(c[-3]).toBeLessThan(c[-2]);
        expect(c[-2]).toBeLessThan(c[0]);
        expect(c[0]).toBeLessThan(c[2]);
        expect(c[2]).toBeLessThan(c[3]);
        expect(c[0]).toBeCloseTo(M, 10);
      });
    });
  }

  it('rechaza z fuera del dominio (base ≤ 0)', () => {
    // 1 + L·S·z = 1 + (-2)(0.5)(2) = -1
    expect(() => medidaDesdeZ(2, -2, 10, 0.5)).toThrow(RangeError);
  });
});

describe('percentilDesdeZ', () => {
  it('z = 0 → P50', () => {
    expect(percentilDesdeZ(0)).toBeCloseTo(50, 5);
  });

  it('valores conocidos de la normal', () => {
    expect(percentilDesdeZ(1.96)).toBeCloseTo(97.5, 1);
    expect(percentilDesdeZ(-1.96)).toBeCloseTo(2.5, 1);
    expect(percentilDesdeZ(-2)).toBeCloseTo(2.275, 2);
    expect(percentilDesdeZ(3)).toBeCloseTo(99.865, 2);
  });

  it('es simétrica y acotada', () => {
    expect(percentilDesdeZ(1.3) + percentilDesdeZ(-1.3)).toBeCloseTo(100, 5);
    expect(percentilDesdeZ(10)).toBeLessThanOrEqual(100);
    expect(percentilDesdeZ(-10)).toBeGreaterThanOrEqual(0);
  });
});

describe('caso Mateo (12,2 kg a 97,0 cm)', () => {
  // Parámetros LMS aproximados de la OMS, peso para la longitud/talla, niños, 97,0 cm.
  // El informe estima z ≈ −2,2 por interpolación lineal, de ahí la tolerancia de 0,1.
  const L = -0.3521;
  const M = 14.5;
  const S = 0.0825;

  it('z ≈ −2,2', () => {
    const z = calcularZ(12.2, L, M, S);
    expect(Math.abs(z - -2.2)).toBeLessThanOrEqual(0.1);
  });
});
