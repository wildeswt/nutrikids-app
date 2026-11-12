import { describe, expect, it } from 'vitest';
import { LENGTH_HEIGHT_CORRECTION_CM, adjustLengthHeight } from './length-height.js';

describe('adjustLengthHeight', () => {
  it('defines the correction constant as 0.7 cm', () => {
    expect(LENGTH_HEIGHT_CORRECTION_CM).toBe(0.7);
  });

  it('measured standing with recumbent table: adds 0.7 cm', () => {
    expect(adjustLengthHeight(97, 'standing', 'recumbent')).toBe(97.7);
  });

  it('measured recumbent with standing table: subtracts 0.7 cm', () => {
    expect(adjustLengthHeight(97, 'recumbent', 'standing')).toBe(96.3);
  });

  it('same position: preserves value without changes', () => {
    expect(adjustLengthHeight(97, 'standing', 'standing')).toBe(97);
    expect(adjustLengthHeight(97, 'recumbent', 'recumbent')).toBe(97);
  });

  it('rejects invalid or non-positive values', () => {
    expect(() => adjustLengthHeight(0, 'standing', 'recumbent')).toThrow(RangeError);
    expect(() => adjustLengthHeight(NaN, 'standing', 'recumbent')).toThrow(RangeError);
  });
});
