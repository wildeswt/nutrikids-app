import { describe, expect, it } from 'vitest';
import {
  EMPTY_FOLLOW_UP_FORM,
  buildFollowUpInput,
  isFollowUpFormEmpty,
  isoDateToInput,
  nextCheckupAfterDays,
  type FollowUpFormData,
} from '../lib/follow-up-form.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ALERT_ID = '22222222-2222-4222-8222-222222222222';
const TODAY = '2026-11-14';

const valid: FollowUpFormData = {
  type: 'recommendation',
  details: '  Reforzar la variedad de alimentos.  ',
  nextCheckupText: '',
  establish: true,
};

describe('buildFollowUpInput', () => {
  it('builds the input with the trimmed detail and the alert', () => {
    const result = buildFollowUpInput(valid, { id: ID, alertId: ALERT_ID, today: TODAY });
    expect(result).toEqual({
      ok: true,
      input: {
        id: ID,
        type: 'recommendation',
        details: 'Reforzar la variedad de alimentos.',
        alertId: ALERT_ID,
      },
    });
  });

  it('leaves the alert and the date out when there are none', () => {
    const result = buildFollowUpInput(valid, { id: ID, today: TODAY });
    expect(result.ok && Object.keys(result.input).sort()).toEqual(['details', 'id', 'type']);
  });

  it('converts the next checkup from DD/MM/AAAA to an ISO date', () => {
    const result = buildFollowUpInput(
      { ...valid, nextCheckupText: '25/11/2026' },
      { id: ID, today: TODAY },
    );
    expect(result.ok && result.input.nextCheckupDate).toBe('2026-11-25');
  });

  it('accepts today as the next checkup', () => {
    const result = buildFollowUpInput(
      { ...valid, nextCheckupText: '14/11/2026' },
      { id: ID, today: TODAY },
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    [{ type: null }, { code: 'typeRequired' }],
    [{ details: '   ' }, { code: 'detailsRequired' }],
    [{ details: 'x'.repeat(2001) }, { code: 'detailsTooLong', max: 2000 }],
    [{ nextCheckupText: '31/02/2026' }, { code: 'dateInvalid' }],
    [{ nextCheckupText: 'mañana' }, { code: 'dateInvalid' }],
    [{ nextCheckupText: '13/11/2026' }, { code: 'datePast' }],
  ] as [Partial<FollowUpFormData>, unknown][])('rejects %o', (changes, error) => {
    const result = buildFollowUpInput({ ...valid, ...changes }, { id: ID, today: TODAY });
    expect(result).toEqual({ ok: false, error });
  });

  it('rejects an id that is not a UUID', () => {
    expect(buildFollowUpInput(valid, { id: 'abc', today: TODAY })).toEqual({
      ok: false,
      error: { code: 'invalid' },
    });
  });
});

describe('dates', () => {
  it('computes the local day some days ahead, across months', () => {
    expect(nextCheckupAfterDays(7, new Date(2026, 10, 14))).toBe('21/11/2026');
    expect(nextCheckupAfterDays(30, new Date(2026, 11, 20))).toBe('19/01/2027');
  });

  it('formats an ISO date as DD/MM/AAAA', () => {
    expect(isoDateToInput('2026-01-05')).toBe('05/01/2026');
  });
});

describe('isFollowUpFormEmpty', () => {
  it('is empty until something is typed or chosen', () => {
    expect(isFollowUpFormEmpty(EMPTY_FOLLOW_UP_FORM)).toBe(true);
    expect(isFollowUpFormEmpty({ ...EMPTY_FOLLOW_UP_FORM, details: ' ' })).toBe(true);
    expect(isFollowUpFormEmpty({ ...EMPTY_FOLLOW_UP_FORM, type: 'referral' })).toBe(false);
    expect(isFollowUpFormEmpty({ ...EMPTY_FOLLOW_UP_FORM, nextCheckupText: '1/1/2027' })).toBe(
      false,
    );
  });
});
