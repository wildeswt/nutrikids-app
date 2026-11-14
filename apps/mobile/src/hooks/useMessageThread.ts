import { MESSAGE_BODY_MAX_LENGTH, type MessageResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import {
  fetchMessages,
  getMessageErrorMessage,
  markThreadReadApi,
  sendMessageApi,
} from '../lib/messages-api.js';
import { generateUuid } from '../lib/uuid.js';

export type MessageSendStatus = 'sending' | 'failed';

export interface ThreadMessage extends MessageResponse {
  sendStatus?: MessageSendStatus;
}

export interface UseMessageThreadParams {
  childId: string | null;
  withUserId: string | null;
  currentUserId: string | null;
}

export interface UseMessageThreadResult {
  messages: ThreadMessage[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  sending: boolean;
  hasMore: boolean;
  error: string | null;
  sendError: string | null;
  clearSendError: () => void;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshSilent: () => Promise<void>;
  loadOlder: () => Promise<void>;
  send: (body: string) => Promise<boolean>;
  retryMessage: (messageId: string) => Promise<boolean>;
}

const DEFAULT_PAGE_LIMIT = 30;

function mergeServerMessages(
  existing: readonly ThreadMessage[],
  latestChronological: readonly MessageResponse[],
): ThreadMessage[] {
  const latestIds = new Set(latestChronological.map((item) => item.id));
  const oldestLatestSentAt = latestChronological[0]?.sentAt;

  const olderKept = existing.filter(
    (item) =>
      !item.sendStatus &&
      !latestIds.has(item.id) &&
      (!oldestLatestSentAt || item.sentAt <= oldestLatestSentAt),
  );
  const optimisticKept = existing.filter(
    (item) => Boolean(item.sendStatus) && !latestIds.has(item.id),
  );

  return [...olderKept, ...latestChronological, ...optimisticKept];
}

/**
 * Gestiona un hilo de chat sobre un niño: carga paginada (cronológica ascendente),
 * marcado como leído al abrir o al recibir mensajes, refresco silencioso y envío optimista
 * con idempotencia por UUID de cliente.
 */
export function useMessageThread({
  childId,
  withUserId,
  currentUserId,
}: UseMessageThreadParams): UseMessageThreadResult {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesRef = useRef<ThreadMessage[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const targetKeyRef = useRef('');

  const targetKey = `${childId ?? ''}:${withUserId ?? ''}`;
  if (targetKeyRef.current !== targetKey) {
    targetKeyRef.current = targetKey;
    messagesRef.current = [];
    nextCursorRef.current = null;
  }

  const updateMessages = useCallback((updater: (prev: ThreadMessage[]) => ThreadMessage[]) => {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const markThreadAsRead = useCallback(async (cId: string, otherId: string) => {
    try {
      await markThreadReadApi({ childId: cId, withUserId: otherId });
    } catch {
      // No bloqueamos la lectura del hilo si falla el marcado silencioso.
    }
  }, []);

  const fetchFirstPage = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!childId || !withUserId) {
        updateMessages(() => []);
        nextCursorRef.current = null;
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return;
      }

      const id = ++requestIdRef.current;
      const keyAtStart = targetKey;

      if (mode === 'initial') {
        if (messagesRef.current.length === 0) {
          setLoading(true);
        }
        setError(null);
      } else if (mode === 'refresh') {
        setRefreshing(true);
        setError(null);
      }

      try {
        const page = await fetchMessages({
          childId,
          withUserId,
          limit: DEFAULT_PAGE_LIMIT,
        });
        if (targetKeyRef.current !== keyAtStart) return;
        if (mode !== 'silent' && id !== requestIdRef.current) return;

        // La API devuelve del más reciente al más antiguo; el chat muestra orden cronológico ascendente.
        const chronological = [...page.items].reverse();

        if (mode === 'initial' && messagesRef.current.length === 0) {
          updateMessages(() => chronological);
          nextCursorRef.current = page.nextCursor;
          setHasMore(page.nextCursor !== null);
        } else {
          updateMessages((prev) => mergeServerMessages(prev, chronological));
          if (page.nextCursor === null) {
            nextCursorRef.current = null;
            setHasMore(false);
          } else if (nextCursorRef.current === null) {
            nextCursorRef.current = page.nextCursor;
            setHasMore(true);
          }
        }

        const hasUnreadIncoming = chronological.some(
          (item) => item.senderId === withUserId && !item.readAt,
        );
        if (mode === 'initial' || hasUnreadIncoming) {
          void markThreadAsRead(childId, withUserId);
        }
      } catch (err) {
        if (targetKeyRef.current !== keyAtStart) return;
        if (mode !== 'silent' && messagesRef.current.length === 0) {
          setError(getMessageErrorMessage(err, i18n.t('errors:messages.thread')));
        }
      } finally {
        if (targetKeyRef.current === keyAtStart) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [childId, markThreadAsRead, targetKey, updateMessages, withUserId],
  );

  const reload = useCallback(() => fetchFirstPage('initial'), [fetchFirstPage]);
  const refresh = useCallback(() => fetchFirstPage('refresh'), [fetchFirstPage]);
  const refreshSilent = useCallback(() => fetchFirstPage('silent'), [fetchFirstPage]);

  const loadOlder = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!childId || !withUserId || !cursor || loadingMore) {
      return;
    }

    const keyAtStart = targetKey;
    setLoadingMore(true);

    try {
      const page = await fetchMessages({
        childId,
        withUserId,
        cursor,
        limit: DEFAULT_PAGE_LIMIT,
      });
      if (targetKeyRef.current !== keyAtStart) return;

      const olderChronological = [...page.items].reverse();
      updateMessages((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const uniqueOlder = olderChronological.filter((item) => !existingIds.has(item.id));
        return [...uniqueOlder, ...prev];
      });
      nextCursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } catch (err) {
      if (targetKeyRef.current !== keyAtStart) return;
      setSendError(getMessageErrorMessage(err, i18n.t('errors:messages.thread')));
    } finally {
      if (targetKeyRef.current === keyAtStart) {
        setLoadingMore(false);
      }
    }
  }, [childId, loadingMore, targetKey, updateMessages, withUserId]);

  const dispatchSend = useCallback(
    async (messageId: string, body: string): Promise<boolean> => {
      if (!childId || !withUserId || !currentUserId) {
        return false;
      }

      const keyAtStart = targetKey;
      setSendError(null);
      setSending(true);

      const optimisticMessage: ThreadMessage = {
        id: messageId,
        childId,
        senderId: currentUserId,
        recipientId: withUserId,
        kind: 'message',
        body,
        sentAt: new Date().toISOString(),
        readAt: null,
        sendStatus: 'sending',
      };

      updateMessages((prev) => {
        const exists = prev.some((item) => item.id === messageId);
        if (exists) {
          return prev.map((item) =>
            item.id === messageId
              ? { ...item, sendStatus: 'sending', sentAt: optimisticMessage.sentAt }
              : item,
          );
        }
        return [...prev, optimisticMessage];
      });

      try {
        const saved = await sendMessageApi({
          id: messageId,
          childId,
          recipientId: withUserId,
          body,
        });
        if (targetKeyRef.current !== keyAtStart) return true;

        updateMessages((prev) => prev.map((item) => (item.id === messageId ? saved : item)));
        return true;
      } catch (err) {
        if (targetKeyRef.current !== keyAtStart) return false;

        updateMessages((prev) =>
          prev.map((item) => (item.id === messageId ? { ...item, sendStatus: 'failed' } : item)),
        );
        setSendError(getMessageErrorMessage(err, i18n.t('errors:messages.send')));
        return false;
      } finally {
        if (targetKeyRef.current === keyAtStart) {
          setSending(false);
        }
      }
    },
    [childId, currentUserId, targetKey, updateMessages, withUserId],
  );

  const send = useCallback(
    async (rawBody: string): Promise<boolean> => {
      const trimmed = rawBody.trim();
      if (
        trimmed.length === 0 ||
        trimmed.length > MESSAGE_BODY_MAX_LENGTH ||
        !childId ||
        !withUserId ||
        !currentUserId
      ) {
        return false;
      }

      // Si el último intento con el mismo texto falló, reutiliza su UUID para mantener idempotencia.
      const existingFailed = [...messagesRef.current]
        .reverse()
        .find((item) => item.sendStatus === 'failed' && item.body === trimmed);
      const id = existingFailed ? existingFailed.id : generateUuid();

      return dispatchSend(id, trimmed);
    },
    [childId, currentUserId, dispatchSend, withUserId],
  );

  const retryMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const target = messagesRef.current.find(
        (item) => item.id === messageId && item.sendStatus === 'failed',
      );
      if (!target) {
        return false;
      }
      return dispatchSend(target.id, target.body);
    },
    [dispatchSend],
  );

  const clearSendError = useCallback(() => {
    setSendError(null);
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    refreshing,
    sending,
    hasMore,
    error,
    sendError,
    clearSendError,
    reload,
    refresh,
    refreshSilent,
    loadOlder,
    send,
    retryMessage,
  };
}
