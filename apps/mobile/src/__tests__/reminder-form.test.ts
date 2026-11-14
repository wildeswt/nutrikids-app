import { describe, expect, it } from 'vitest';
import {
  buildCreateReminderInput,
  formatTimeInput,
  groupReminders,
  parseTimeInput,
} from '../lib/reminder-form.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
/** Local time, so the tests do not depend on the timezone of the machine. */
const NOW = new Date(2026, 10, 14, 10, 0, 0);

const form = {
  childId: CHILD_ID,
  type: 'checkup' as const,
  dateText: '20/11/2026',
  timeText: '09:30',
};

describe('parseTimeInput / formatTimeInput', () => {
  it('parses valid 24 hour times', () => {
    expect(parseTimeInput('09:30')).toEqual({ hours: 9, minutes: 30 });
    expect(parseTimeInput(' 9:05 ')).toEqual({ hours: 9, minutes: 5 });
    expect(parseTimeInput('23:59')).toEqual({ hours: 23, minutes: 59 });
  });

  it('rejects anything that is not a real time', () => {
    for (const raw of ['', '24:00', '12:60', '9', '9:5', 'abc', '09.30']) {
      expect(parseTimeInput(raw), raw).toBeNull();
    }
  });

  it('formats the local time with two digits', () => {
    expect(formatTimeInput(new Date(2026, 0, 1, 7, 5))).toBe('07:05');
  });
});

describe('buildCreateReminderInput', () => {
  it('builds the body with the typed local date and time as an ISO instant', () => {
    const result = buildCreateReminderInput(form, { now: NOW, id: ID });

    expect(result).toEqual({
      ok: true,
      input: {
        id: ID,
        childId: CHILD_ID,
        type: 'checkup',
        scheduledFor: new Date(2026, 10, 20, 9, 30).toISOString(),
      },
    });
  });

  it('creates an id when none is given and accepts activities', () => {
    const result = buildCreateReminderInput({ ...form, type: 'activity' }, { now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.type).toBe('activity');
      expect(result.input.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it.each([
    [{ childId: '' }, 'childRequired'],
    [{ dateText: ' ' }, 'dateRequired'],
    [{ dateText: '31/02/2026' }, 'dateInvalid'],
    [{ timeText: '' }, 'timeRequired'],
    [{ timeText: '25:00' }, 'timeInvalid'],
    [{ dateText: '14/11/2026', timeText: '09:00' }, 'pastDate'],
    [{ dateText: '13/11/2026' }, 'pastDate'],
  ])('rejects %j with %s', (override, code) => {
    const result = buildCreateReminderInput({ ...form, ...override }, { now: NOW, id: ID });
    expect(result).toEqual({ ok: false, error: { code } });
  });

  it('accepts a time later today', () => {
    const result = buildCreateReminderInput(
      { ...form, dateText: '14/11/2026', timeText: '18:00' },
      { now: NOW, id: ID },
    );
    expect(result.ok).toBe(true);
  });
});

describe('groupReminders', () => {
  const make = (id: string, scheduledFor: Date, status: 'pending' | 'sent' | 'completed') => ({
    id,
    childId: CHILD_ID,
    type: 'checkup',
    scheduledFor: scheduledFor.toISOString(),
    status,
  });

  const later = make('later', new Date(2026, 10, 25, 9, 0), 'pending');
  const soon = make('soon', new Date(2026, 10, 18, 9, 0), 'sent');
  const todayLate = make('today', new Date(2026, 10, 14, 20, 0), 'pending');
  const overdue = make('overdue', new Date(2026, 10, 10, 9, 0), 'pending');
  const doneOld = make('doneOld', new Date(2026, 9, 1, 9, 0), 'completed');
  const doneNew = make('doneNew', new Date(2026, 10, 1, 9, 0), 'completed');

  it('puts today and overdue reminders in the today card and the rest in the list', () => {
    const groups = groupReminders([later, soon, todayLate, overdue, doneOld, doneNew], NOW);

    expect(groups.today.map((item) => item.id)).toEqual(['overdue', 'today']);
    expect(groups.upcoming.map((item) => item.id)).toEqual(['soon', 'later']);
  });

  it('lists completed reminders most recent first and keeps them out of the next ones', () => {
    const groups = groupReminders([doneOld, doneNew, later], NOW);

    expect(groups.completed.map((item) => item.id)).toEqual(['doneNew', 'doneOld']);
    expect([...groups.today, ...groups.upcoming].map((item) => item.id)).toEqual(['later']);
  });

  it('returns empty groups for no reminders', () => {
    expect(groupReminders([], NOW)).toEqual({ today: [], upcoming: [], completed: [] });
  });
});
