import type { NotificationResponse } from '@nutrikids/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchNotificationsApi, markNotificationReadApi } from '../lib/notifications-api.js';

export interface UseNotificationsResult {
  notifications: NotificationResponse[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  unreadCount: number;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const items = await fetchNotificationsApi();
      setNotifications(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar notificaciones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      const updated = await markNotificationReadApi(id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, readAt: updated.readAt } : item)),
      );
    } catch (err) {
      console.warn('Error al marcar notificacion como leida:', err);
    }
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.readAt).length,
    [notifications],
  );

  const reload = useCallback(() => loadNotifications(false), [loadNotifications]);
  const refresh = useCallback(() => loadNotifications(true), [loadNotifications]);

  return {
    notifications,
    loading,
    refreshing,
    error,
    unreadCount,
    reload,
    refresh,
    markAsRead,
  };
}
