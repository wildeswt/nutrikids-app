import { describe, expect, it } from 'vitest';
import {
  WHO_REFERENCE_VERSION,
  getLmsParameters,
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
} from './reference.js';

describe('WHO 2006 Reference Data Module', () => {
  it('exports official release version identifier WHO 2006', () => {
    expect(WHO_REFERENCE_VERSION).toBe('WHO 2006');
  });

  describe('Range coverage requirements', () => {
    it('WFA covers months 12 to 60 for girls and boys (49 continuous months)', () => {
      expect(WFA_FEMALE).toHaveLength(49);
      expect(WFA_MALE).toHaveLength(49);
      expect(WFA_FEMALE[0].x).toBe(12);
      expect(WFA_FEMALE[WFA_FEMALE.length - 1].x).toBe(60);
      expect(WFA_MALE[0].x).toBe(12);
      expect(WFA_MALE[WFA_MALE.length - 1].x).toBe(60);
    });

    it('LHFA covers months 12 to 60 for girls and boys (49 continuous months)', () => {
      expect(LHFA_FEMALE).toHaveLength(49);
      expect(LHFA_MALE).toHaveLength(49);
      expect(LHFA_FEMALE[0].x).toBe(12);
      expect(LHFA_FEMALE[LHFA_FEMALE.length - 1].x).toBe(60);
      expect(LHFA_MALE[0].x).toBe(12);
      expect(LHFA_MALE[LHFA_MALE.length - 1].x).toBe(60);
    });

    it('BFA covers months 12 to 60 for girls and boys (49 continuous months)', () => {
      expect(BFA_FEMALE).toHaveLength(49);
      expect(BFA_MALE).toHaveLength(49);
      expect(BFA_FEMALE[0].x).toBe(12);
      expect(BFA_FEMALE[BFA_FEMALE.length - 1].x).toBe(60);
      expect(BFA_MALE[0].x).toBe(12);
      expect(BFA_MALE[BFA_MALE.length - 1].x).toBe(60);
    });

    it('WFLH covers recumbent length (45 to 110 cm) and standing height (65 to 120 cm) in 0.5 cm steps', () => {
      // Recumbent length (WFL): 45.0 to 110.0 cm -> 131 rows
      expect(WFL_FEMALE).toHaveLength(131);
      expect(WFL_MALE).toHaveLength(131);
      expect(WFL_FEMALE[0].x).toBe(45);
      expect(WFL_FEMALE[WFL_FEMALE.length - 1].x).toBe(110);

      // Standing height (WFH): 65.0 to 120.0 cm -> 111 rows
      expect(WFH_FEMALE).toHaveLength(111);
      expect(WFH_MALE).toHaveLength(111);
      expect(WFH_FEMALE[0].x).toBe(65);
      expect(WFH_FEMALE[WFH_FEMALE.length - 1].x).toBe(120);
    });
  });

  describe('Verification against official WHO 2006 tables (5 reference cases)', () => {
    it('Case 1: WFA - Girls - Month 24 (official table tab_wfa_girls_p_0_5.xlsx)', () => {
      const lms = getLmsParameters('WEIGHT_FOR_AGE', 'FEMALE', 24);
      expect(lms.x).toBe(24);
      expect(lms.l).toBeCloseTo(-0.2941, 4);
      expect(lms.m).toBeCloseTo(11.4775, 4);
      expect(lms.s).toBeCloseTo(0.1239, 4);
    });

    it('Case 2: LHFA - Boys - Month 36 (official table tab_lhfa_boys_p_2_5.xlsx)', () => {
      const lms = getLmsParameters('LENGTH_HEIGHT_FOR_AGE', 'MALE', 36);
      expect(lms.x).toBe(36);
      expect(lms.l).toBe(1);
      expect(lms.m).toBeCloseTo(96.0835, 4);
      expect(lms.s).toBeCloseTo(0.03858, 5);
    });

    it('Case 3: BFA - Girls - Month 60 (official table tab_bmi_girls_p_2_5.xlsx)', () => {
      const lms = getLmsParameters('BMI_FOR_AGE', 'FEMALE', 60);
      expect(lms.x).toBe(60);
      expect(lms.l).toBeCloseTo(-0.5684, 4);
      expect(lms.m).toBeCloseTo(15.2747, 4);
      expect(lms.s).toBeCloseTo(0.09789, 5);
    });

    it('Case 4: WFLH - Boys - Height 80.0 cm standing (official table tab_wfh_boys_p_2_5.xlsx)', () => {
      const lms = getLmsParameters('WEIGHT_FOR_LENGTH_HEIGHT', 'MALE', 80.0, 'standing');
      expect(lms.x).toBe(80.0);
      expect(lms.l).toBeCloseTo(-0.3521, 4);
      expect(lms.m).toBeCloseTo(10.5781, 4);
      expect(lms.s).toBeCloseTo(0.08298, 5);
    });

    it('Case 5: WFLH - Girls - Length 55.0 cm recumbent (official table tab_wfl_girls_p_0_2.xlsx)', () => {
      const lms = getLmsParameters('WEIGHT_FOR_LENGTH_HEIGHT', 'FEMALE', 55.0, 'recumbent');
      expect(lms.x).toBe(55.0);
      expect(lms.l).toBeCloseTo(-0.3833, 4);
      expect(lms.m).toBeCloseTo(4.5498, 4);
      expect(lms.s).toBeCloseTo(0.0911, 4);
    });

    it('throws RangeError when measurement falls outside domain', () => {
      expect(() => getLmsParameters('WEIGHT_FOR_AGE', 'MALE', 11)).toThrow(RangeError);
      expect(() => getLmsParameters('WEIGHT_FOR_AGE', 'MALE', 61)).toThrow(RangeError);
      expect(() => getLmsParameters('WEIGHT_FOR_LENGTH_HEIGHT', 'MALE', 40.0)).toThrow(RangeError);
      expect(() => getLmsParameters('WEIGHT_FOR_LENGTH_HEIGHT', 'FEMALE', 125.0)).toThrow(
        RangeError,
      );
    });
  });
});
