import type { ConversationResponse, ReminderResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import { formatShortDate } from '../i18n/format.js';
import i18n from '../i18n/index.js';
import { fetchConversations, getMessageErrorMessage } from '../lib/messages-api.js';
import { fetchReminders } from '../lib/reminders-api.js';

export type HomeSummarySectionStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface HomeLatestMessage {
  conversation: ConversationResponse;
  senderName: string;
  body: string;
  sentAt: string;
}

export interface HomeSummaryState {
  messageStatus: HomeSummarySectionStatus;
  latestMessage: HomeLatestMessage | null;
  messageError: string | null;
  reminderStatus: HomeSummarySectionStatus;
  nextReminder: ReminderResponse | null;
  reminderError: string | null;
}

/**
 * Selects the conversation whose last message is the most recent one received from a professional
 * and not yet read. Messages sent by the caregiver or already read are ignored.
 */
export function selectLatestConversation(
  conversations: readonly ConversationResponse[],
): ConversationResponse | null {
  let latest: ConversationResponse | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const item of conversations) {
    const { lastMessage, participant } = item;
    if (participant.role !== 'PROFESSIONAL') continue;
    if (lastMessage.senderId !== participant.userId || lastMessage.readAt !== null) continue;
    const time = new Date(item.lastMessage.sentAt).getTime();
    if (Number.isNaN(time)) continue;
    if (time > latestTime) {
      latest = item;
      latestTime = time;
    }
  }

  return latest;
}

/**
 * Selects the soonest non-completed reminder (`pending` or `sent`).
 */
export function selectNextReminder(
  reminders: readonly ReminderResponse[],
): ReminderResponse | null {
  const open = reminders
    .filter((item) => item.status !== 'completed')
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  return open[0] ?? null;
}

/**
 * Formats an ISO timestamp as a concise relative label for the Home "Para ti" card.
 */
export function formatRelativeMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays <= 0) {
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 1) {
      return i18n.t('caregiver:home.timeJustNow', { defaultValue: 'Hace un momento' });
    }
    if (diffMinutes < 60) {
      return i18n.t('caregiver:home.timeMinutesAgo', {
        count: diffMinutes,
        defaultValue: `Hace ${diffMinutes} min`,
      });
    }
    const diffHours = Math.floor(diffMinutes / 60);
    return i18n.t('caregiver:home.timeHoursAgo', {
      count: diffHours,
      defaultValue: `Hace ${diffHours} h`,
    });
  }

  if (diffDays === 1) {
    return i18n.t('common:time.yesterday');
  }

  if (diffDays <= 30) {
    return i18n.t('common:time.daysAgo', { count: diffDays });
  }

  return formatShortDate(date);
}

/**
 * Loads the real summary data shown on the caregiver Home: latest conversation message and next
 * pending reminder. Each section settles independently so one error never breaks the other.
 */
export function useHomeSummary() {
  const [state, setState] = useState<HomeSummaryState>({
    messageStatus: 'idle',
    latestMessage: null,
    messageError: null,
    reminderStatus: 'idle',
    nextReminder: null,
    reminderError: null,
  });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState((prev) => ({
      ...prev,
      messageStatus: prev.latestMessage ? prev.messageStatus : 'loading',
      messageError: null,
      reminderStatus: prev.nextReminder ? prev.reminderStatus : 'loading',
      reminderError: null,
    }));

    const [conversationsResult, remindersResult] = await Promise.allSettled([
      fetchConversations(),
      fetchReminders(),
    ]);

    if (requestId !== latestRequest.current) return;

    setState(() => {
      let messageStatus: HomeSummarySectionStatus;
      let latestMessage: HomeLatestMessage | null = null;
      let messageError: string | null = null;

      if (conversationsResult.status === 'fulfilled') {
        const latestConversation = selectLatestConversation(conversationsResult.value);
        if (latestConversation) {
          messageStatus = 'ready';
          latestMessage = {
            conversation: latestConversation,
            senderName:
              `${latestConversation.participant.firstName} ${latestConversation.participant.lastName}`.trim(),
            body: latestConversation.lastMessage.body,
            sentAt: latestConversation.lastMessage.sentAt,
          };
        } else {
          messageStatus = 'empty';
        }
      } else {
        messageStatus = 'error';
        messageError = getMessageErrorMessage(
          conversationsResult.reason,
          i18n.t('errors:messages.conversations'),
        );
      }

      let reminderStatus: HomeSummarySectionStatus;
      let nextReminder: ReminderResponse | null = null;
      let reminderError: string | null = null;

      if (remindersResult.status === 'fulfilled') {
        nextReminder = selectNextReminder(remindersResult.value);
        reminderStatus = nextReminder ? 'ready' : 'empty';
      } else {
        reminderStatus = 'error';
        reminderError =
          remindersResult.reason instanceof Error
            ? remindersResult.reason.message
            : i18n.t('errors:reminders.fetch');
      }

      return {
        messageStatus,
        latestMessage,
        messageError,
        reminderStatus,
        nextReminder,
        reminderError,
      };
    });
  }, []);

  return {
    ...state,
    load,
  };
}
