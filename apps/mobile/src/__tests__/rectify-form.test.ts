import { describe, expect, it } from 'vitest';
import { buildRectifyInput, rectifyFormFromChild } from '../lib/rectify-form.js';

const child = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-05',
  sex: 'MALE' as const,
};

describe('rectifyFormFromChild', () => {
  it('starts with the current data, the date as DD/MM/AAAA', () => {
    expect(rectifyFormFromChild(child)).toEqual({
      firstName: 'Mateo',
      lastName: 'Gómez',
      birthDateText: '05/06/2023',
      sex: 'MALE',
    });
  });
});

describe('buildRectifyInput', () => {
  const unchanged = rectifyFormFromChild(child);

  it('sends only the fields that changed', () => {
    const result = buildRectifyInput({ ...unchanged, firstName: ' Mateo José ' }, child, {
      identityEditable: true,
    });

    expect(result).toEqual({ ok: true, input: { firstName: 'Mateo José' } });
  });

  it('includes birth date and sex when the child has no checkups', () => {
    const result = buildRectifyInput(
      { ...unchanged, birthDateText: '15/06/2023', sex: 'FEMALE' },
      child,
      { identityEditable: true },
    );

    expect(result).toEqual({ ok: true, input: { birthDate: '2023-06-15', sex: 'FEMALE' } });
  });

  it('ignores birth date and sex when the child already has checkups', () => {
    const result = buildRectifyInput(
      { ...unchanged, lastName: 'Gómez Ríos', birthDateText: '15/06/2023', sex: 'FEMALE' },
      child,
      { identityEditable: false },
    );

    expect(result).toEqual({ ok: true, input: { lastName: 'Gómez Ríos' } });
  });

  it.each([
    [{ firstName: '  ' }, true, 'firstNameRequired'],
    [{ lastName: '' }, true, 'lastNameRequired'],
    [{ birthDateText: '31/02/2023' }, true, 'dateInvalid'],
    [{}, true, 'noChanges'],
    [{ birthDateText: 'basura' }, false, 'noChanges'],
  ])('rejects %j (identity editable: %s) with %s', (override, identityEditable, code) => {
    const result = buildRectifyInput({ ...unchanged, ...override }, child, { identityEditable });

    expect(result).toEqual({ ok: false, error: { code } });
  });
});
