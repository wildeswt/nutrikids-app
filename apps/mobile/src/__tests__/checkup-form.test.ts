import { describe, expect, it } from 'vitest';
import {
  buildCreateCheckupInput,
  formatDateInput,
  measuredAtFromIsoDate,
  parseDateInput,
  parseDecimalInput,
} from '../lib/checkup-form.js';
import { generateUuid } from '../lib/uuid.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Local noon, so the calendar day is the same in every timezone.
const NOW = new Date(2026, 10, 14, 12, 0, 0);
const CHILD_ID_FIELDS = { birthDate: '2023-06-15', id: '22222222-2222-4222-8222-222222222222' };

const validForm = {
  dateText: '10/11/2026',
  weightText: '13,4',
  heightText: '91.5',
  position: 'STANDING' as const,
};

describe('generateUuid', () => {
  it('returns RFC 4122 v4 identifiers that differ on every call', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateUuid()));

    expect(ids.size).toBe(20);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('works when crypto.randomUUID is not available (Hermes)', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(generateUuid()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('date and decimal inputs', () => {
  it('parses a comma or a dot as decimal separator', () => {
    expect(parseDecimalInput('13,4')).toBe(13.4);
    expect(parseDecimalInput(' 13.4 ')).toBe(13.4);
    expect(parseDecimalInput('abc')).toBeNaN();
  });

  it('formats and parses DD/MM/AAAA', () => {
    expect(formatDateInput(NOW)).toBe('14/11/2026');
    expect(parseDateInput('14/11/2026')).toBe('2026-11-14');
    expect(parseDateInput('4-1-2026')).toBe('2026-01-04');
    expect(parseDateInput('4.1.2026')).toBe('2026-01-04');
  });

  it('rejects dates that do not exist or have another shape', () => {
    expect(parseDateInput('31/02/2026')).toBeNull();
    expect(parseDateInput('2026-11-14')).toBeNull();
    expect(parseDateInput('14/11/26')).toBeNull();
    expect(parseDateInput('')).toBeNull();
  });

  it('uses the current instant for today and noon UTC for other days', () => {
    expect(measuredAtFromIsoDate('2026-11-14', NOW)).toBe(NOW.toISOString());
    expect(measuredAtFromIsoDate('2026-11-10', NOW)).toBe('2026-11-10T12:00:00.000Z');
  });
});

describe('buildCreateCheckupInput', () => {
  it('builds a valid CreateCheckupInput with a client-side id', () => {
    const result = buildCreateCheckupInput(validForm, {
      ...CHILD_ID_FIELDS,
      confirmOutlier: false,
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      input: {
        id: CHILD_ID_FIELDS.id,
        measuredAt: '2026-11-10T12:00:00.000Z',
        weightKg: 13.4,
        lengthHeightCm: 91.5,
        position: 'STANDING',
      },
    });
  });

  it('generates the id when none is given', () => {
    const result = buildCreateCheckupInput(validForm, {
      birthDate: CHILD_ID_FIELDS.birthDate,
      confirmOutlier: false,
      now: NOW,
    });

    expect(result.ok && result.input.id).toMatch(UUID_V4);
  });

  it.each([
    ['empty date', { dateText: '  ' }, 'dateRequired'],
    ['malformed date', { dateText: '10 de noviembre' }, 'dateInvalid'],
    ['future date', { dateText: '15/11/2026' }, 'dateFuture'],
    ['date before birth', { dateText: '01/01/2023' }, 'dateBeforeBirth'],
    ['weight below the physical limit', { weightText: '1,5' }, 'weightRange'],
    ['weight that is not a number', { weightText: 'mucho' }, 'weightRange'],
    ['height above the physical limit', { heightText: '150' }, 'heightRange'],
  ])('rejects %s', (_label, change, code) => {
    const result = buildCreateCheckupInput(
      { ...validForm, ...change },
      { ...CHILD_ID_FIELDS, confirmOutlier: false, now: NOW },
    );

    expect(result).toMatchObject({ ok: false, error: { code } });
  });

  it('reports the allowed range in the range errors', () => {
    const result = buildCreateCheckupInput(
      { ...validForm, weightText: '50' },
      { ...CHILD_ID_FIELDS, confirmOutlier: false, now: NOW },
    );

    expect(result).toEqual({ ok: false, error: { code: 'weightRange', min: 2, max: 40 } });
  });

  it('asks for confirmation of atypical values and then sends confirmOutlier', () => {
    const atypical = { ...validForm, weightText: '35' };

    const first = buildCreateCheckupInput(atypical, {
      ...CHILD_ID_FIELDS,
      confirmOutlier: false,
      now: NOW,
    });
    expect(first).toEqual({ ok: false, error: { code: 'outlier' } });

    const confirmed = buildCreateCheckupInput(atypical, {
      ...CHILD_ID_FIELDS,
      confirmOutlier: true,
      now: NOW,
    });
    expect(confirmed).toMatchObject({ ok: true, input: { weightKg: 35, confirmOutlier: true } });
  });

  it('does not send confirmOutlier for plausible values', () => {
    const result = buildCreateCheckupInput(validForm, {
      ...CHILD_ID_FIELDS,
      confirmOutlier: true,
      now: NOW,
    });

    expect(result.ok && 'confirmOutlier' in result.input).toBe(false);
  });

  it('trims notes and omits them when empty or whitespace-only', () => {
    const withNotes = buildCreateCheckupInput(
      { ...validForm, notesText: '  Buen apetito hoy  ' },
      { ...CHILD_ID_FIELDS, confirmOutlier: false, now: NOW },
    );
    expect(withNotes).toMatchObject({ ok: true, input: { notes: 'Buen apetito hoy' } });

    const blank = buildCreateCheckupInput(
      { ...validForm, notesText: '   ' },
      { ...CHILD_ID_FIELDS, confirmOutlier: false, now: NOW },
    );
    expect(blank.ok && 'notes' in blank.input).toBe(false);
  });

  it('accepts 500-character notes and rejects longer text', () => {
    const maxNotes = 'a'.repeat(500);
    const ok = buildCreateCheckupInput(
      { ...validForm, notesText: maxNotes },
      { ...CHILD_ID_FIELDS, confirmOutlier: false, now: NOW },
    );
    expect(ok).toMatchObject({ ok: true, input: { notes: maxNotes } });

    const tooLong = buildCreateCheckupInput(
      { ...validForm, notesText: 'a'.repeat(501) },
      { ...CHILD_ID_FIELDS, confirmOutlier: false, now: NOW },
    );
    expect(tooLong).toEqual({
      ok: false,
      error: { code: 'notesTooLong', max: 500 },
    });
  });
});
