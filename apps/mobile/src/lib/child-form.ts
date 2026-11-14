import type { CreateChildInput, Sex } from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { CURRENT_CONSENT_VERSION } from './consent-api.js';

/**
 * Relationship values sent to the API. They are stable codes (English, uppercase) so the stored
 * value never depends on the app language; the label shown to the user is translated.
 */
export const RELATIONSHIP_OPTIONS = ['MOTHER', 'FATHER', 'LEGAL_GUARDIAN'] as const;

export type Relationship = (typeof RELATIONSHIP_OPTIONS)[number];

/** Legacy free-text values stored before the codes existed (NK-21, seed data). */
const LEGACY_RELATIONSHIPS: Record<string, Relationship> = {
  madre: 'MOTHER',
  padre: 'FATHER',
  'tutor legal': 'LEGAL_GUARDIAN',
};

/** Normalizes a stored relationship (code or legacy Spanish text) to a code, if known. */
export function toRelationshipCode(value: string): Relationship | null {
  const trimmed = value.trim();
  if ((RELATIONSHIP_OPTIONS as readonly string[]).includes(trimmed)) {
    return trimmed as Relationship;
  }
  return LEGACY_RELATIONSHIPS[trimmed.toLowerCase()] ?? null;
}

/** Translated label for a stored relationship; unknown values are shown as stored. */
export function relationshipLabel(value: string): string {
  const code = toRelationshipCode(value);
  return code ? i18n.t(`common:relationships.${code}`) : value;
}

export interface ChildFormData {
  firstName: string;
  lastName: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  sex: Sex;
  relationship: Relationship;
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
