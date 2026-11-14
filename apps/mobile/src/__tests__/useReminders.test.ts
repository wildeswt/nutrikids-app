import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { useReminders } from '../hooks/useReminders.js';
import * as remindersApi from '../lib/reminders-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';

const reminder = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: CHILD_ID,
  type: 'checkup',
  scheduledFor: '2026-11-20T14:00:00.000Z',
  status: 'pending' as const,
};

function capture<T>(useHook: () => T): { current: T } {
  const captured = {} as { current: T };
  function TestComponent() {
    captured.current = useHook();
    return React.createElement('div', null, 'ok');
  }
  renderToString(React.createElement(TestComponent));
  return captured;
}

describe('useReminders hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle and does not fetch on its own (the screen loads on focus)', () => {
    const fetchSpy = vi.spyOn(remindersApi, 'fetchReminders');
    const hook = capture(() => useReminders());

    expect(hook.current.status).toBe('idle');
    expect(hook.current.reminders).toEqual([]);
    expect(hook.current.error).toBeNull();
    expect(hook.current.completingIds).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('load fetches every reminder and returns them', async () => {
    vi.spyOn(remindersApi, 'fetchReminders').mockResolvedValueOnce([reminder]);
    const hook = capture(() => useReminders());

    await expect(hook.current.load()).resolves.toEqual([reminder]);
    expect(remindersApi.fetchReminders).toHaveBeenCalledWith();
  });

  it('load returns null instead of throwing when the request fails', async () => {
    vi.spyOn(remindersApi, 'fetchReminders').mockRejectedValueOnce(new Error('Sin conexión'));
    const hook = capture(() => useReminders());

    await expect(hook.current.load()).resolves.toBeNull();
  });

  it('create sends the input and returns the stored reminder', async () => {
    vi.spyOn(remindersApi, 'createReminder').mockResolvedValueOnce(reminder);
    const hook = capture(() => useReminders());
    const input = {
      id: reminder.id,
      childId: CHILD_ID,
      type: 'checkup' as const,
      scheduledFor: reminder.scheduledFor,
    };

    await expect(hook.current.create(input)).resolves.toEqual(reminder);
    expect(remindersApi.createReminder).toHaveBeenCalledWith(input);
  });

  it('create lets the error reach the screen', async () => {
    vi.spyOn(remindersApi, 'createReminder').mockRejectedValueOnce(new Error('Sin consentimiento'));
    const hook = capture(() => useReminders());

    await expect(
      hook.current.create({
        id: reminder.id,
        childId: CHILD_ID,
        type: 'activity',
        scheduledFor: reminder.scheduledFor,
      }),
    ).rejects.toThrow('Sin consentimiento');
  });

  it('complete marks the reminder as done through the API', async () => {
    const completed = { ...reminder, status: 'completed' as const };
    vi.spyOn(remindersApi, 'completeReminder').mockResolvedValueOnce(completed);
    const hook = capture(() => useReminders());

    await expect(hook.current.complete(reminder.id)).resolves.toEqual(completed);
    expect(remindersApi.completeReminder).toHaveBeenCalledWith(reminder.id);
  });

  it('complete lets the error reach the screen', async () => {
    vi.spyOn(remindersApi, 'completeReminder').mockRejectedValueOnce(new Error('No existe'));
    const hook = capture(() => useReminders());

    await expect(hook.current.complete(reminder.id)).rejects.toThrow('No existe');
  });
});
