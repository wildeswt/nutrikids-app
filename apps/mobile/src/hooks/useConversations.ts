import type { ConversationResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import i18n from '../i18n/index.js';
import { fetchConversations, getMessageErrorMessage } from '../lib/messages-api.js';

export interface UseConversationsResult {
  conversations: ConversationResponse[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  unreadTotal: number;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Carga la lista de conversaciones del usuario autenticado (`GET /messages/conversations`).
 * Mantiene el orden devuelto por el servidor (último mensaje más reciente primero).
 */
export function useConversations(childId?: string): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (isRefresh: boolean) => {
      const id = ++requestId.current;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const items = await fetchConversations(childId ? { childId } : {});
        if (id !== requestId.current) return;
        setConversations(items);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(getMessageErrorMessage(err, i18n.t('errors:messages.conversations')));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [childId],
  );

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);
  const unreadTotal = conversations.reduce((sum, item) => sum + item.unreadCount, 0);

  return {
    conversations,
    loading,
    refreshing,
    error,
    unreadTotal,
    reload,
    refresh,
  };
}
