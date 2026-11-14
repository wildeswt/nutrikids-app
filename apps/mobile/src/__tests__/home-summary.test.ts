import type { ConversationResponse, ReminderResponse } from '@nutrikids/shared';
import type * as ReactTypes from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookStore = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  stateCursor: 0,
  refCursor: 0,
  reset() {
    this.states = [];
    this.refs = [];
    this.stateCursor = 0;
    this.refCursor = 0;
  },
  rewind() {
    this.stateCursor = 0;
    this.refCursor = 0;
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const idx = hookStore.stateCursor++;
      if (!(idx in hookStore.states)) {
        hookStore.states[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (updater: T | ((prev: T) => T)) => {
        const prev = hookStore.states[idx] as T;
        hookStore.states[idx] =
          typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
      };
      return [hookStore.states[idx] as T, setState] as const;
    },
    useRef<T>(initial: T) {
      const idx = hookStore.refCursor++;
      if (!(idx in hookStore.refs)) {
        hookStore.refs[idx] = { current: initial };
      }
      return hookStore.refs[idx] as ReactTypes.RefObject<T>;
    },
    useCallback<T extends (...args: never[]) => unknown>(fn: T) {
      return fn;
    },
  };
});

const apiMocks = vi.hoisted(() => ({
  fetchConversations: vi.fn<() => Promise<ConversationResponse[]>>(),
  fetchReminders: vi.fn<() => Promise<ReminderResponse[]>>(),
}));

vi.mock('../lib/messages-api.js', () => ({
  fetchConversations: () => apiMocks.fetchConversations(),
  getMessageErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback,
}));

vi.mock('../lib/reminders-api.js', () => ({
  fetchReminders: () => apiMocks.fetchReminders(),
}));

import {
  formatRelativeMessageTime,
  selectLatestConversation,
  selectNextReminder,
  useHomeSummary,
} from '../hooks/useHomeSummary.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const USER_A = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';

function makeConversation(
  overrides: Partial<ConversationResponse> & { sentAt?: string; body?: string } = {},
): ConversationResponse {
  return {
    childId: CHILD_ID,
    participant: overrides.participant ?? {
      userId: USER_A,
      firstName: 'Dra. Carolina',
      lastName: 'Díaz',
      role: 'PROFESSIONAL',
      specialty: 'pediatrics',
    },
    lastMessage: overrides.lastMessage ?? {
      id: '44444444-4444-4444-8444-444444444444',
      childId: CHILD_ID,
      senderId: USER_A,
      recipientId: USER_B,
      kind: 'message',
      body: overrides.body ?? 'Sigamos ofreciendo agua durante el día',
      sentAt: overrides.sentAt ?? '2026-11-12T10:00:00.000Z',
      readAt: null,
    },
    unreadCount: overrides.unreadCount ?? 1,
  };
}

function makeReminder(overrides: Partial<ReminderResponse> = {}): ReminderResponse {
  return {
    id: overrides.id ?? '55555555-5555-4555-8555-555555555555',
    childId: overrides.childId ?? CHILD_ID,
    type: overrides.type ?? 'checkup',
    scheduledFor: overrides.scheduledFor ?? '2026-11-24T09:30:00.000Z',
    status: overrides.status ?? 'pending',
  };
}

function renderHook() {
  hookStore.rewind();
  return useHomeSummary();
}

describe('useHomeSummary (NK-66)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookStore.reset();
  });

  describe('selectLatestConversation', () => {
    it('returns null when there are no conversations', () => {
      expect(selectLatestConversation([])).toBeNull();
    });

    it('picks the conversation with the most recent message timestamp', () => {
      const older = makeConversation({
        sentAt: '2026-11-10T08:00:00.000Z',
        body: 'Mensaje antiguo',
      });
      const newer = makeConversation({
        sentAt: '2026-11-14T12:00:00.000Z',
        body: 'Mensaje más reciente',
        participant: {
          userId: USER_B,
          firstName: 'Lic. Jorge',
          lastName: 'Mora',
          role: 'PROFESSIONAL',
          specialty: 'nutrition',
        },
      });

      const selected = selectLatestConversation([older, newer]);
      expect(selected?.lastMessage.body).toBe('Mensaje más reciente');
      expect(selected?.participant.firstName).toBe('Lic. Jorge');
    });
  });

  describe('selectNextReminder', () => {
    it('ignores completed reminders and picks the soonest open one', () => {
      const completed = makeReminder({
        id: '10000000-0000-4000-8000-000000000001',
        scheduledFor: '2026-11-15T08:00:00.000Z',
        status: 'completed',
      });
      const later = makeReminder({
        id: '10000000-0000-4000-8000-000000000002',
        scheduledFor: '2026-11-28T10:00:00.000Z',
        status: 'pending',
      });
      const soonest = makeReminder({
        id: '10000000-0000-4000-8000-000000000003',
        scheduledFor: '2026-11-18T09:30:00.000Z',
        status: 'sent',
      });

      expect(selectNextReminder([completed, later, soonest])?.id).toBe(soonest.id);
      expect(selectNextReminder([completed])).toBeNull();
      expect(selectNextReminder([])).toBeNull();
    });
  });

  describe('formatRelativeMessageTime', () => {
    const now = new Date(2026, 10, 14, 15, 0, 0);

    it('formats minutes, hours, yesterday and days ago', () => {
      expect(formatRelativeMessageTime(new Date(2026, 10, 14, 14, 45, 0).toISOString(), now)).toBe(
        'Hace 15 min',
      );
      expect(formatRelativeMessageTime(new Date(2026, 10, 14, 12, 0, 0).toISOString(), now)).toBe(
        'Hace 3 h',
      );
      expect(formatRelativeMessageTime(new Date(2026, 10, 13, 18, 0, 0).toISOString(), now)).toBe(
        'Ayer',
      );
      expect(formatRelativeMessageTime(new Date(2026, 10, 12, 10, 0, 0).toISOString(), now)).toBe(
        'Hace 2 días',
      );
    });
  });

  describe('hook load lifecycle', () => {
    it('loads the latest message and next pending reminder', async () => {
      apiMocks.fetchConversations.mockResolvedValue([makeConversation()]);
      apiMocks.fetchReminders.mockResolvedValue([makeReminder()]);

      const initial = renderHook();
      expect(initial.messageStatus).toBe('idle');
      expect(initial.reminderStatus).toBe('idle');

      await initial.load();
      const loaded = renderHook();

      expect(loaded.messageStatus).toBe('ready');
      expect(loaded.latestMessage?.senderName).toBe('Dra. Carolina Díaz');
      expect(loaded.latestMessage?.body).toBe('Sigamos ofreciendo agua durante el día');
      expect(loaded.reminderStatus).toBe('ready');
      expect(loaded.nextReminder?.type).toBe('checkup');
    });

    it('sets empty statuses when there are no conversations or open reminders', async () => {
      apiMocks.fetchConversations.mockResolvedValue([]);
      apiMocks.fetchReminders.mockResolvedValue([makeReminder({ status: 'completed' })]);

      const hook = renderHook();
      await hook.load();
      const loaded = renderHook();

      expect(loaded.messageStatus).toBe('empty');
      expect(loaded.latestMessage).toBeNull();
      expect(loaded.reminderStatus).toBe('empty');
      expect(loaded.nextReminder).toBeNull();
    });

    it('keeps each section independent when one endpoint fails', async () => {
      apiMocks.fetchConversations.mockRejectedValue(new Error('Sin conexión'));
      apiMocks.fetchReminders.mockResolvedValue([makeReminder()]);

      const hook = renderHook();
      await hook.load();
      const loaded = renderHook();

      expect(loaded.messageStatus).toBe('error');
      expect(loaded.messageError).toBe('Sin conexión');
      expect(loaded.reminderStatus).toBe('ready');
      expect(loaded.nextReminder).not.toBeNull();
    });
  });
});
