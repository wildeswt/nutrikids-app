import {
  RectifyChildInputSchema,
  type ChildResponse,
  type RectifyChildInput,
} from '@nutrikids/shared';
import { formatDateInput, parseDateInput } from './checkup-form.js';

export interface RectifyFormData {
  firstName: string;
  lastName: string;
  /** Date typed as `DD/MM/AAAA`. */
  birthDateText: string;
  sex: ChildResponse['sex'];
}

/** Why the form cannot be sent; each code maps to a message in `caregiver:editChild.errors`. */
export type RectifyFormError =
  | { code: 'firstNameRequired' }
  | { code: 'lastNameRequired' }
  | { code: 'dateInvalid' }
  | { code: 'noChanges' }
  | { code: 'invalid' };

export type RectifyFormResult =
  { ok: true; input: RectifyChildInput } | { ok: false; error: RectifyFormError };

/** Form values that start as the data the child has now. */
export function rectifyFormFromChild(child: ChildResponse): RectifyFormData {
  const [year, month, day] = child.birthDate.split('-').map(Number) as [number, number, number];
  return {
    firstName: child.firstName,
    lastName: child.lastName,
    birthDateText: formatDateInput(new Date(year, month - 1, day)),
    sex: child.sex,
  };
}

/**
 * Validates the form and builds the body of `PATCH /children/:childId` with **only the fields that
 * changed**. The birth date and sex are only considered when `identityEditable` (the child has no
 * checkups yet; otherwise the server answers 409).
 */
export function buildRectifyInput(
  form: RectifyFormData,
  child: ChildResponse,
  options: { identityEditable: boolean },
): RectifyFormResult {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  if (!firstName) return { ok: false, error: { code: 'firstNameRequired' } };
  if (!lastName) return { ok: false, error: { code: 'lastNameRequired' } };

  const changes: RectifyChildInput = {};
  if (firstName !== child.firstName) changes.firstName = firstName;
  if (lastName !== child.lastName) changes.lastName = lastName;

  if (options.identityEditable) {
    const birthDate = parseDateInput(form.birthDateText);
    if (!birthDate) return { ok: false, error: { code: 'dateInvalid' } };
    if (birthDate !== child.birthDate) changes.birthDate = birthDate;
    if (form.sex !== child.sex) changes.sex = form.sex;
  }

  if (Object.keys(changes).length === 0) return { ok: false, error: { code: 'noChanges' } };

  const parsed = RectifyChildInputSchema.safeParse(changes);
  if (!parsed.success) return { ok: false, error: { code: 'invalid' } };
  return { ok: true, input: parsed.data };
}
