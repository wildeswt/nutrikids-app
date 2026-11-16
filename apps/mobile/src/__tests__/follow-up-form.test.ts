import { describe, expect, it } from 'vitest';
import {
  EMPTY_FOLLOW_UP_FORM,
  buildFollowUpBatchInput,
  buildFollowUpInput,
  formatNextCheckupLong,
  isFollowUpFormEmpty,
  isoDateToInput,
  isoToLocalDate,
  minNextCheckupDate,
  nextCheckupAfterDays,
  nextCheckupPickerValue,
  type FollowUpFormData,
} from '../lib/follow-up-form.js';

const OBS_ID = '11111111-1111-4111-8111-111111111111';
const INTER_ID = '22222222-2222-4222-8222-222222222222';
const REF_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '44444444-4444-4444-8444-444444444444';
const ALERT_ID = '55555555-5555-4555-8555-555555555555';
const TODAY = '2026-11-14';

const testIds = {
  observation: OBS_ID,
  intervention: INTER_ID,
  referral: REF_ID,
  groupId: GROUP_ID,
};

const validForm: FollowUpFormData = {
  observations: '  Observación de peso y talla.  ',
  intervention: 'Ajuste de dieta hipocalórica.',
  referral: 'Derivación a pediatría.',
  nextCheckupText: '',
  establish: true,
};

describe('buildFollowUpBatchInput (NK-75)', () => {
  it('builds a batch input with all three non-empty sections trimmed', () => {
    const result = buildFollowUpBatchInput(validForm, {
      ids: testIds,
      alertId: ALERT_ID,
      today: TODAY,
    });
    expect(result).toEqual({
      ok: true,
      input: {
        groupId: GROUP_ID,
        alertId: ALERT_ID,
        items: [
          { id: OBS_ID, type: 'observation', details: 'Observación de peso y talla.' },
          { id: INTER_ID, type: 'intervention', details: 'Ajuste de dieta hipocalórica.' },
          { id: REF_ID, type: 'referral', details: 'Derivación a pediatría.' },
        ],
      },
    });
  });

  it('builds a batch input with only one section (observations)', () => {
    const form: FollowUpFormData = {
      ...EMPTY_FOLLOW_UP_FORM,
      observations: 'Solo observaciones.',
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result).toEqual({
      ok: true,
      input: {
        groupId: GROUP_ID,
        items: [{ id: OBS_ID, type: 'observation', details: 'Solo observaciones.' }],
      },
    });
  });

  it('builds a batch input with two sections (intervention and referral)', () => {
    const form: FollowUpFormData = {
      ...EMPTY_FOLLOW_UP_FORM,
      intervention: 'Plan nutricional.',
      referral: 'Interconsulta.',
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result).toEqual({
      ok: true,
      input: {
        groupId: GROUP_ID,
        items: [
          { id: INTER_ID, type: 'intervention', details: 'Plan nutricional.' },
          { id: REF_ID, type: 'referral', details: 'Interconsulta.' },
        ],
      },
    });
  });

  it('converts nextCheckupText to ISO nextCheckupDate', () => {
    const form: FollowUpFormData = {
      ...validForm,
      nextCheckupText: '25/11/2026',
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result.ok && result.input.nextCheckupDate).toBe('2026-11-25');
  });

  it('accepts today as the next checkup date', () => {
    const form: FollowUpFormData = {
      ...validForm,
      nextCheckupText: '14/11/2026',
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result.ok).toBe(true);
  });

  it('rejects when all three sections are empty', () => {
    const form: FollowUpFormData = {
      ...EMPTY_FOLLOW_UP_FORM,
      observations: '   ',
      intervention: '',
      referral: '  ',
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result).toEqual({
      ok: false,
      error: { code: 'atLeastOneRequired' },
    });
  });

  it('rejects when observations exceeds 2000 chars', () => {
    const form: FollowUpFormData = {
      ...validForm,
      observations: 'a'.repeat(2001),
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result).toEqual({
      ok: false,
      error: { code: 'detailsTooLong', field: 'observations', max: 2000 },
    });
  });

  it('rejects when intervention exceeds 2000 chars', () => {
    const form: FollowUpFormData = {
      ...validForm,
      intervention: 'b'.repeat(2001),
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result).toEqual({
      ok: false,
      error: { code: 'detailsTooLong', field: 'intervention', max: 2000 },
    });
  });

  it('rejects when referral exceeds 2000 chars', () => {
    const form: FollowUpFormData = {
      ...validForm,
      referral: 'c'.repeat(2001),
    };
    const result = buildFollowUpBatchInput(form, { ids: testIds, today: TODAY });
    expect(result).toEqual({
      ok: false,
      error: { code: 'detailsTooLong', field: 'referral', max: 2000 },
    });
  });

  it('rejects invalid and past dates', () => {
    expect(
      buildFollowUpBatchInput(
        { ...validForm, nextCheckupText: '31/02/2026' },
        { ids: testIds, today: TODAY },
      ),
    ).toEqual({ ok: false, error: { code: 'dateInvalid' } });

    expect(
      buildFollowUpBatchInput(
        { ...validForm, nextCheckupText: '13/11/2026' },
        { ids: testIds, today: TODAY },
      ),
    ).toEqual({ ok: false, error: { code: 'datePast' } });
  });

  it('rejects non-uuid ids', () => {
    expect(
      buildFollowUpBatchInput(validForm, {
        ids: { ...testIds, observation: 'not-a-uuid' },
        today: TODAY,
      }),
    ).toEqual({ ok: false, error: { code: 'invalid' } });
  });
});

describe('buildFollowUpInput (legacy)', () => {
  const legacyValid = {
    type: 'recommendation' as const,
    details: '  Reforzar la variedad de alimentos.  ',
    nextCheckupText: '',
  };

  it('builds the input with the trimmed detail and the alert', () => {
    const result = buildFollowUpInput(legacyValid, { id: OBS_ID, alertId: ALERT_ID, today: TODAY });
    expect(result).toEqual({
      ok: true,
      input: {
        id: OBS_ID,
        type: 'recommendation',
        details: 'Reforzar la variedad de alimentos.',
        alertId: ALERT_ID,
      },
    });
  });

  it('leaves the alert and the date out when there are none', () => {
    const result = buildFollowUpInput(legacyValid, { id: OBS_ID, today: TODAY });
    expect(result.ok && Object.keys(result.input).sort()).toEqual(['details', 'id', 'type']);
  });

  it('rejects missing type or details', () => {
    expect(
      buildFollowUpInput({ ...legacyValid, type: null }, { id: OBS_ID, today: TODAY }),
    ).toEqual({ ok: false, error: { code: 'typeRequired' } });
    expect(
      buildFollowUpInput({ ...legacyValid, details: '   ' }, { id: OBS_ID, today: TODAY }),
    ).toEqual({ ok: false, error: { code: 'detailsRequired' } });
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

  it('formats the next checkup in localized long date format', () => {
    expect(formatNextCheckupLong('25/10/2026')).toBe('25 de octubre de 2026');
    expect(formatNextCheckupLong('')).toBeNull();
    expect(formatNextCheckupLong('31/02/2026')).toBeNull();
  });

  it('computes local calendar dates and clamps picker value to today (UTC)', () => {
    const parsed = isoToLocalDate('2026-10-25');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9);
    expect(parsed?.getDate()).toBe(25);
    expect(isoToLocalDate('2026-02-30')).toBeNull();

    const minDate = minNextCheckupDate('2026-11-14');
    expect([minDate.getFullYear(), minDate.getMonth(), minDate.getDate()]).toEqual([2026, 10, 14]);

    const future = nextCheckupPickerValue('25/11/2026', '2026-11-14');
    expect([future.getFullYear(), future.getMonth(), future.getDate()]).toEqual([2026, 10, 25]);

    const past = nextCheckupPickerValue('10/11/2026', '2026-11-14');
    expect([past.getFullYear(), past.getMonth(), past.getDate()]).toEqual([2026, 10, 14]);
  });
});

describe('isFollowUpFormEmpty', () => {
  it('is empty until something is typed or chosen', () => {
    expect(isFollowUpFormEmpty(EMPTY_FOLLOW_UP_FORM)).toBe(true);
    expect(
      isFollowUpFormEmpty({
        ...EMPTY_FOLLOW_UP_FORM,
        observations: ' ',
        intervention: '',
        referral: '',
      }),
    ).toBe(true);
    expect(isFollowUpFormEmpty({ ...EMPTY_FOLLOW_UP_FORM, observations: 'Nota' })).toBe(false);
    expect(isFollowUpFormEmpty({ ...EMPTY_FOLLOW_UP_FORM, intervention: 'Dieta' })).toBe(false);
    expect(isFollowUpFormEmpty({ ...EMPTY_FOLLOW_UP_FORM, referral: 'Pediatra' })).toBe(false);
    expect(isFollowUpFormEmpty({ ...EMPTY_FOLLOW_UP_FORM, nextCheckupText: '1/1/2027' })).toBe(
      false,
    );
  });
});
