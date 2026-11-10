import { describe, expect, it } from 'vitest';
import {
  WHO_REFERENCE_VERSION,
  obtenerLMS,
  WFA_FEMALE,
  WFA_MALE,
  LHFA_FEMALE,
  LHFA_MALE,
  BFA_FEMALE,
  BFA_MALE,
  WFL_FEMALE,
  WFL_MALE,
  WFH_FEMALE,
  WFH_MALE,
} from './referencia.js';

describe('Referencia OMS 2006 — Módulo de datos para cálculo sin conexión', () => {
  it('exporta la versión oficial WHO 2006', () => {
    expect(WHO_REFERENCE_VERSION).toBe('WHO 2006');
  });

  describe('Cobertura de rangos requeridos (RT-08)', () => {
    it('P/E cubre meses 12 a 60 para niñas y niños (49 meses continuos)', () => {
      expect(WFA_FEMALE).toHaveLength(49);
      expect(WFA_MALE).toHaveLength(49);
      expect(WFA_FEMALE[0].x).toBe(12);
      expect(WFA_FEMALE[WFA_FEMALE.length - 1].x).toBe(60);
      expect(WFA_MALE[0].x).toBe(12);
      expect(WFA_MALE[WFA_MALE.length - 1].x).toBe(60);
    });

    it('T/E cubre meses 12 a 60 para niñas y niños (49 meses continuos)', () => {
      expect(LHFA_FEMALE).toHaveLength(49);
      expect(LHFA_MALE).toHaveLength(49);
      expect(LHFA_FEMALE[0].x).toBe(12);
      expect(LHFA_FEMALE[LHFA_FEMALE.length - 1].x).toBe(60);
      expect(LHFA_MALE[0].x).toBe(12);
      expect(LHFA_MALE[LHFA_MALE.length - 1].x).toBe(60);
    });

    it('IMC/E cubre meses 12 a 60 para niñas y niños (49 meses continuos)', () => {
      expect(BFA_FEMALE).toHaveLength(49);
      expect(BFA_MALE).toHaveLength(49);
      expect(BFA_FEMALE[0].x).toBe(12);
      expect(BFA_FEMALE[BFA_FEMALE.length - 1].x).toBe(60);
      expect(BFA_MALE[0].x).toBe(12);
      expect(BFA_MALE[BFA_MALE.length - 1].x).toBe(60);
    });

    it('P/T cubre longitud (45 a 110 cm) y talla (65 a 120 cm) cada 0.5 cm', () => {
      // Longitud (WFL, acostado): 45.0 a 110.0 cm -> 131 filas
      expect(WFL_FEMALE).toHaveLength(131);
      expect(WFL_MALE).toHaveLength(131);
      expect(WFL_FEMALE[0].x).toBe(45);
      expect(WFL_FEMALE[WFL_FEMALE.length - 1].x).toBe(110);

      // Talla (WFH, de pie): 65.0 a 120.0 cm -> 111 filas
      expect(WFH_FEMALE).toHaveLength(111);
      expect(WFH_MALE).toHaveLength(111);
      expect(WFH_FEMALE[0].x).toBe(65);
      expect(WFH_FEMALE[WFH_FEMALE.length - 1].x).toBe(120);
    });
  });

  describe('Verificación contra tablas oficiales OMS 2006 (5 casos clave)', () => {
    it('Caso 1: P/E — Niñas — Mes 24 (tabla oficial tab_wfa_girls_p_0_5.xlsx)', () => {
      const lms = obtenerLMS('WEIGHT_FOR_AGE', 'FEMALE', 24);
      expect(lms.x).toBe(24);
      expect(lms.l).toBeCloseTo(-0.2941, 4);
      expect(lms.m).toBeCloseTo(11.4775, 4);
      expect(lms.s).toBeCloseTo(0.1239, 4);
    });

    it('Caso 2: T/E — Niños — Mes 36 (tabla oficial tab_lhfa_boys_p_2_5.xlsx)', () => {
      const lms = obtenerLMS('LENGTH_HEIGHT_FOR_AGE', 'MALE', 36);
      expect(lms.x).toBe(36);
      expect(lms.l).toBe(1);
      expect(lms.m).toBeCloseTo(96.0835, 4);
      expect(lms.s).toBeCloseTo(0.03858, 5);
    });

    it('Caso 3: IMC/E — Niñas — Mes 60 (tabla oficial tab_bmi_girls_p_2_5.xlsx)', () => {
      const lms = obtenerLMS('BMI_FOR_AGE', 'FEMALE', 60);
      expect(lms.x).toBe(60);
      expect(lms.l).toBeCloseTo(-0.5684, 4);
      expect(lms.m).toBeCloseTo(15.2747, 4);
      expect(lms.s).toBeCloseTo(0.09789, 5);
    });

    it('Caso 4: P/T — Niños — Talla 80.0 cm de pie (tabla oficial tab_wfh_boys_p_2_5.xlsx)', () => {
      const lms = obtenerLMS('WEIGHT_FOR_LENGTH_HEIGHT', 'MALE', 80.0, 'de_pie');
      expect(lms.x).toBe(80.0);
      expect(lms.l).toBeCloseTo(-0.3521, 4);
      expect(lms.m).toBeCloseTo(10.5781, 4);
      expect(lms.s).toBeCloseTo(0.08298, 5);
    });

    it('Caso 5: P/T — Niñas — Longitud 55.0 cm acostado (tabla oficial tab_wfl_girls_p_0_2.xlsx)', () => {
      const lms = obtenerLMS('WEIGHT_FOR_LENGTH_HEIGHT', 'FEMALE', 55.0, 'acostado');
      expect(lms.x).toBe(55.0);
      expect(lms.l).toBeCloseTo(-0.3833, 4);
      expect(lms.m).toBeCloseTo(4.5498, 4);
      expect(lms.s).toBeCloseTo(0.0911, 4);
    });
  });

  describe('Manejo de errores fuera de rango', () => {
    it('lanza RangeError si la edad es menor a 12 o mayor a 60 meses', () => {
      expect(() => obtenerLMS('WEIGHT_FOR_AGE', 'FEMALE', 11)).toThrow(RangeError);
      expect(() => obtenerLMS('WEIGHT_FOR_AGE', 'FEMALE', 61)).toThrow(RangeError);
    });

    it('lanza RangeError si la medida P/T está fuera de límites', () => {
      expect(() => obtenerLMS('WEIGHT_FOR_LENGTH_HEIGHT', 'MALE', 40.0)).toThrow(RangeError);
      expect(() => obtenerLMS('WEIGHT_FOR_LENGTH_HEIGHT', 'MALE', 125.0)).toThrow(RangeError);
    });
  });
});
