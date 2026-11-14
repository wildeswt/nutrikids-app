import {
  CreateFollowUpBatchInputSchema,
  CreateFollowUpInputSchema,
  FOLLOW_UP_DETAILS_MAX,
  FOLLOW_UP_TYPES,
  todayIsoDate,
  type CreateFollowUpBatchInput,
  type CreateFollowUpBatchItem,
  type CreateFollowUpInput,
  type FollowUpType,
} from '@nutrikids/shared';
import { formatLongDate } from '../i18n/format.js';
import { parseDateInput, toLocalIsoDate } from './checkup-form.js';

export { FOLLOW_UP_TYPES };

/** Quick choices for the next checkup, in days from today. */
export const NEXT_CHECKUP_SHORTCUT_DAYS = [7, 14, 30, 90] as const;

export interface FollowUpFormData {
  /** Sección «Observaciones clínicas» (tipo `observation`). */
  observations: string;
  /** Sección «Intervención nutricional» (tipo `intervention`). */
  intervention: string;
  /** Sección «Derivación» (tipo `referral`). */
  referral: string;
  /** Next checkup stored as `DD/MM/AAAA`; empty when there is none. */
  nextCheckupText: string;
  /** Move the alert to «seguimiento establecido» once the follow-up is saved. */
  establish: boolean;
}

export const EMPTY_FOLLOW_UP_FORM: FollowUpFormData = {
  observations: '',
  intervention: '',
  referral: '',
  nextCheckupText: '',
  establish: true,
};

/** Why the form cannot be sent; each code maps to a message in `professional:followUp.errors`. */
export type FollowUpFormError =
  | { code: 'atLeastOneRequired' }
  | { code: 'detailsTooLong'; field?: 'observations' | 'intervention' | 'referral'; max: number }
  | { code: 'dateInvalid' }
  | { code: 'datePast' }
  | { code: 'invalid' };

export type FollowUpFormResult =
  { ok: true; input: CreateFollowUpBatchInput } | { ok: false; error: FollowUpFormError };

export interface BuildFollowUpBatchOptions {
  ids: {
    observation: string;
    intervention: string;
    referral: string;
    groupId?: string | undefined;
  };
  alertId?: string | undefined;
  today?: string | undefined;
}

/** `DD/MM/AAAA` of the local day `days` days after `now`. */
export function nextCheckupAfterDays(days: number, now: Date = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return isoDateToInput(toLocalIsoDate(date));
}

/** `YYYY-MM-DD` as `DD/MM/AAAA`. */
export function isoDateToInput(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

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

/** Lower bound for the next-checkup date picker, aligned with today in UTC like the API. */
export function minNextCheckupDate(todayIso: string = todayIsoDate()): Date {
  return isoToLocalDate(todayIso) ?? new Date();
}

/** Value passed to the next-checkup date picker, never earlier than today (UTC). */
export function nextCheckupPickerValue(
  nextCheckupText: string,
  todayIso: string = todayIsoDate(),
): Date {
  const minDate = minNextCheckupDate(todayIso);
  const parsed = parseDateInput(nextCheckupText);
  if (!parsed || parsed < todayIso) return minDate;
  return isoToLocalDate(parsed) ?? minDate;
}

/** Formats `DD/MM/AAAA` as a localized long date (e.g. "25 de octubre de 2026"), or `null`. */
export function formatNextCheckupLong(nextCheckupText: string): string | null {
  if (nextCheckupText.trim() === '') return null;
  const iso = parseDateInput(nextCheckupText);
  if (!iso) return null;
  return formatLongDate(iso);
}

/**
 * Validates the multi-section form and builds the `CreateFollowUpBatchInput` sent to the API (NK-75).
 * Generates 1 to 3 items based on non-empty sections (observación, intervención, derivación).
 * At least one section is required.
 */
export function buildFollowUpBatchInput(
  form: FollowUpFormData,
  options: BuildFollowUpBatchOptions,
): FollowUpFormResult {
  const today = options.today ?? todayIsoDate();
  const obs = form.observations.trim();
  const inter = form.intervention.trim();
  const ref = form.referral.trim();

  if (obs.length === 0 && inter.length === 0 && ref.length === 0) {
    return { ok: false, error: { code: 'atLeastOneRequired' } };
  }

  if (obs.length > FOLLOW_UP_DETAILS_MAX) {
    return {
      ok: false,
      error: { code: 'detailsTooLong', field: 'observations', max: FOLLOW_UP_DETAILS_MAX },
    };
  }
  if (inter.length > FOLLOW_UP_DETAILS_MAX) {
    return {
      ok: false,
      error: { code: 'detailsTooLong', field: 'intervention', max: FOLLOW_UP_DETAILS_MAX },
    };
  }
  if (ref.length > FOLLOW_UP_DETAILS_MAX) {
    return {
      ok: false,
      error: { code: 'detailsTooLong', field: 'referral', max: FOLLOW_UP_DETAILS_MAX },
    };
  }

  let nextCheckupDate: string | undefined;
  if (form.nextCheckupText.trim() !== '') {
    const parsed = parseDateInput(form.nextCheckupText);
    if (!parsed) return { ok: false, error: { code: 'dateInvalid' } };
    if (parsed < today) return { ok: false, error: { code: 'datePast' } };
    nextCheckupDate = parsed;
  }

  const items: CreateFollowUpBatchItem[] = [];
  if (obs.length > 0) {
    items.push({ id: options.ids.observation, type: 'observation', details: obs });
  }
  if (inter.length > 0) {
    items.push({ id: options.ids.intervention, type: 'intervention', details: inter });
  }
  if (ref.length > 0) {
    items.push({ id: options.ids.referral, type: 'referral', details: ref });
  }

  const result = CreateFollowUpBatchInputSchema.safeParse({
    ...(options.ids.groupId ? { groupId: options.ids.groupId } : {}),
    ...(options.alertId ? { alertId: options.alertId } : {}),
    ...(nextCheckupDate ? { nextCheckupDate } : {}),
    items,
  });

  if (!result.success) return { ok: false, error: { code: 'invalid' } };
  return { ok: true, input: result.data };
}

export type LegacyFollowUpResult =
  { ok: true; input: CreateFollowUpInput } | { ok: false; error: { code: string; max?: number } };

/** Legacy builder preserved for individual inputs or backward compatibility. */
export function buildFollowUpInput(
  form: { type: FollowUpType | null; details: string; nextCheckupText: string },
  options: { id: string; alertId?: string | undefined; today?: string },
): LegacyFollowUpResult {
  const today = options.today ?? todayIsoDate();
  if (!form.type) return { ok: false, error: { code: 'typeRequired' } };
  const details = form.details.trim();
  if (details.length === 0) return { ok: false, error: { code: 'detailsRequired' } };
  if (details.length > FOLLOW_UP_DETAILS_MAX) {
    return { ok: false, error: { code: 'detailsTooLong', max: FOLLOW_UP_DETAILS_MAX } };
  }
  let nextCheckupDate: string | undefined;
  if (form.nextCheckupText.trim() !== '') {
    const parsed = parseDateInput(form.nextCheckupText);
    if (!parsed) return { ok: false, error: { code: 'dateInvalid' } };
    if (parsed < today) return { ok: false, error: { code: 'datePast' } };
    nextCheckupDate = parsed;
  }
  const res = CreateFollowUpInputSchema.safeParse({
    id: options.id,
    type: form.type,
    details,
    ...(nextCheckupDate ? { nextCheckupDate } : {}),
    ...(options.alertId ? { alertId: options.alertId } : {}),
  });
  if (!res.success) return { ok: false, error: { code: 'invalid' } };
  return { ok: true, input: res.data };
}

/** `true` when nothing was typed or chosen across any section (an empty draft is not worth saving). */
export function isFollowUpFormEmpty(form: FollowUpFormData): boolean {
  return (
    form.observations.trim() === '' &&
    form.intervention.trim() === '' &&
    form.referral.trim() === '' &&
    form.nextCheckupText.trim() === ''
  );
}
