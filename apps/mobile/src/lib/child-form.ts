import {
  MAX_CHILD_AGE_MONTHS,
  MIN_CHILD_AGE_MONTHS,
  completedMonths,
  todayIsoDate,
  type CreateChildInput,
  type Sex,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { parseDateInput } from './checkup-form.js';
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
  /** Date typed or picked as `DD/MM/AAAA`. */
  birthDateText: string;
  sex: Sex;
  relationship: Relationship;
  isLegalRepresentative: boolean;
}

export type ChildBirthDateStatus =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'future'; isoDate: string }
  | { kind: 'outOfRange'; isoDate: string; months: number }
  | { kind: 'valid'; isoDate: string; months: number };

/** Parses `YYYY-MM-DD` as a local calendar date so the native picker opens on the right day. */
export function isoToLocalDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Evaluates a `DD/MM/AAAA` birth date string against validity, future date, and OMS age range. */
export function evaluateChildBirthDate(
  birthDateText: string,
  referenceDateIso: string = todayIsoDate(),
): ChildBirthDateStatus {
  const trimmed = birthDateText.trim();
  if (!trimmed) return { kind: 'empty' };

  const isoDate = parseDateInput(trimmed);
  if (!isoDate) return { kind: 'invalid' };
  if (isoDate > referenceDateIso) return { kind: 'future', isoDate };

  const months = completedMonths(isoDate, referenceDateIso);
  if (months < MIN_CHILD_AGE_MONTHS || months > MAX_CHILD_AGE_MONTHS) {
    return { kind: 'outOfRange', isoDate, months };
  }

  return { kind: 'valid', isoDate, months };
}

/**
 * Builds the CreateChildInput payload from registration form inputs,
 * parsing `DD/MM/AAAA` into an ISO `YYYY-MM-DD` string and attaching
 * the active informed consent version (NK-20 / NK-21).
 */
export function buildCreateChildPayload(formData: ChildFormData): CreateChildInput {
  const birthDateIso = parseDateInput(formData.birthDateText) ?? '';

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
