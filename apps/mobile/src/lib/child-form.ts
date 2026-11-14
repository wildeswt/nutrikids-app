import type { CreateChildInput, Sex } from '@nutrikids/shared';
import { CURRENT_CONSENT_VERSION } from './consent-api.js';

export interface ChildFormData {
  firstName: string;
  lastName: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  sex: Sex;
  relationship: string;
  isLegalRepresentative: boolean;
}

/**
 * Builds the CreateChildInput payload from registration form inputs,
 * assembling the date parts into an ISO `YYYY-MM-DD` string and attaching
 * the active informed consent version (NK-20 / NK-21).
 */
export function buildCreateChildPayload(formData: ChildFormData): CreateChildInput {
  const formattedDay = formData.birthDay.trim().padStart(2, '0');
  const formattedMonth = formData.birthMonth.trim().padStart(2, '0');
  const birthYear = formData.birthYear.trim();
  const birthDateIso = `${birthYear}-${formattedMonth}-${formattedDay}`;

  return {
    firstName: formData.firstName.trim(),
    lastName: formData.lastName.trim(),
    birthDate: birthDateIso,
    sex: formData.sex,
    relationship: formData.relationship,
    isLegalRepresentative: formData.isLegalRepresentative,
    consentTextVersion: CURRENT_CONSENT_VERSION,
  };
}
