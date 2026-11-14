import type { CreateReminderInput, ReminderResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { completeReminder, createReminder, fetchReminders } from '../lib/reminders-api.js';

export type RemindersStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RemindersHookState {
  status: RemindersStatus;
  reminders: ReminderResponse[];
  error: string | null;
}

/** Soonest first, the order the API uses. */
function sortBySchedule(items: ReminderResponse[]): ReminderResponse[] {
  return [...items].sort(
    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
  );
}

/**
 * Reminders of the caregiver's children. The screen calls `load` when it gains focus; `create`
 * and `complete` update the list without a second request.
 */
export function useReminders() {
  const [state, setState] = useState<RemindersHookState>({
    status: 'idle',
    reminders: [],
    error: null,
  });
  /** Ids being marked as done, to disable their button. */
  const [completingIds, setCompletingIds] = useState<string[]>([]);
  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<ReminderResponse[] | null> => {
    const requestId = ++latestLoad.current;
    // Keep what is on screen while refreshing; only the first load shows the spinner.
    setState((prev) => ({
      ...prev,
      status: prev.reminders.length === 0 ? 'loading' : prev.status,
      error: null,
    }));

    try {
      const reminders = await fetchReminders();
      if (requestId !== latestLoad.current) return reminders;
      setState({ status: 'ready', reminders, error: null });
      return reminders;
    } catch (err) {
      if (requestId !== latestLoad.current) return null;
      setState((prev) => ({
        status: 'error',
        reminders: prev.reminders,
        error: err instanceof Error ? err.message : i18n.t('errors:reminders.fetch'),
      }));
      return null;
    }
  }, []);

  const create = useCallback(async (input: CreateReminderInput): Promise<ReminderResponse> => {
    const reminder = await createReminder(input);
    setState((prev) => ({
      status: 'ready',
      reminders: sortBySchedule([
        ...prev.reminders.filter((item) => item.id !== reminder.id),
        reminder,
      ]),
      error: null,
    }));
    return reminder;
  }, []);

  const complete = useCallback(async (id: string): Promise<ReminderResponse> => {
    setCompletingIds((prev) => [...prev, id]);
    try {
      const updated = await completeReminder(id);
      setState((prev) => ({
        ...prev,
        reminders: prev.reminders.map((item) => (item.id === id ? updated : item)),
      }));
      return updated;
    } finally {
      setCompletingIds((prev) => prev.filter((item) => item !== id));
    }
  }, []);

  return { ...state, completingIds, load, create, complete };
}
