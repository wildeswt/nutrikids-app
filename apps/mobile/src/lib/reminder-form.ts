import {
  CreateReminderInputSchema,
  type CreateReminderInput,
  type ReminderResponse,
} from '@nutrikids/shared';
import { parseDateInput, toLocalIsoDate } from './checkup-form.js';
import { generateUuid } from './uuid.js';

/** Types a user can create (`next_checkup` is reserved for the server). */
export type UserReminderType = CreateReminderInput['type'];

export interface ReminderFormData {
  childId: string;
  type: UserReminderType;
  /** Date typed as `DD/MM/AAAA`. */
  dateText: string;
  /** Time typed as `HH:MM` (24 hours). */
  timeText: string;
}

/** Why the form cannot be sent; each code maps to a message in `caregiver:addReminder.errors`. */
export type ReminderFormError =
  | { code: 'childRequired' }
  | { code: 'dateRequired' }
  | { code: 'dateInvalid' }
  | { code: 'timeRequired' }
  | { code: 'timeInvalid' }
  | { code: 'pastDate' }
  | { code: 'invalid' };

export type ReminderFormResult =
  { ok: true; input: CreateReminderInput } | { ok: false; error: ReminderFormError };

/** Parses `HH:MM` (or `H:MM`) into hours and minutes, or `null` when it is not a real time. */
export function parseTimeInput(raw: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** Formats the local time of a date as `HH:MM`. */
export function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Validates the form and builds the `CreateReminderInput`. The typed date and time are local to
 * the phone; `scheduledFor` is sent as the matching UTC instant (ISO 8601 with `Z`).
 */
export function buildCreateReminderInput(
  form: ReminderFormData,
  options: { now?: Date; id?: string } = {},
): ReminderFormResult {
  const now = options.now ?? new Date();

  if (!form.childId) return { ok: false, error: { code: 'childRequired' } };
  if (!form.dateText.trim()) return { ok: false, error: { code: 'dateRequired' } };
  const isoDate = parseDateInput(form.dateText);
  if (!isoDate) return { ok: false, error: { code: 'dateInvalid' } };
  if (!form.timeText.trim()) return { ok: false, error: { code: 'timeRequired' } };
  const time = parseTimeInput(form.timeText);
  if (!time) return { ok: false, error: { code: 'timeInvalid' } };

  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const scheduled = new Date(year, month - 1, day, time.hours, time.minutes);
  if (scheduled.getTime() <= now.getTime()) return { ok: false, error: { code: 'pastDate' } };

  const parsed = CreateReminderInputSchema.safeParse({
    id: options.id ?? generateUuid(),
    childId: form.childId,
    type: form.type,
    scheduledFor: scheduled.toISOString(),
  });
  if (!parsed.success) return { ok: false, error: { code: 'invalid' } };
  return { ok: true, input: parsed.data };
}

/** Reminders to show, split by the tabs of the screen. */
export interface ReminderGroups {
  /** Not completed and due today (local calendar day) or earlier. */
  today: ReminderResponse[];
  /** Not completed and due after today. */
  upcoming: ReminderResponse[];
  completed: ReminderResponse[];
}

/**
 * Splits reminders for the screen. Pending and sent reminders are "next"; a next reminder whose
 * day is today or already passed goes to the "today" card (so an overdue one is never hidden).
 * Next ones are sorted soonest first; completed ones most recent first.
 */
export function groupReminders(
  reminders: ReminderResponse[],
  now: Date = new Date(),
): ReminderGroups {
  const today = toLocalIsoDate(now);
  const byDate = (a: ReminderResponse, b: ReminderResponse) =>
    new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();

  const open = reminders.filter((item) => item.status !== 'completed').sort(byDate);
  return {
    today: open.filter((item) => toLocalIsoDate(new Date(item.scheduledFor)) <= today),
    upcoming: open.filter((item) => toLocalIsoDate(new Date(item.scheduledFor)) > today),
    completed: reminders.filter((item) => item.status === 'completed').sort((a, b) => byDate(b, a)),
  };
}
