import { Ionicons } from '@expo/vector-icons';
import type { NotificationResponse } from '@nutrikids/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../constants/colors.js';
import { APP_ROUTES } from '../constants/routes.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { formatShortDate } from '../i18n/format.js';

// Colores del diseño en Figma que no están en PALETTE (NK-57)
const DESIGN_COLORS = {
  surface: '#FBFBFB',
  overdueIcon: '#E14100',
  shadow: '#000000',
} as const;

export function NotificationsScreen({
  mode = 'professional',
}: { mode?: 'caregiver' | 'professional' } = {}) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { notifications, loading, refreshing, error, refresh, reload, markAsRead } =
    useNotifications();

  // Recarga notificaciones al enfocar o volver a la pantalla (NK-36)
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/' as never);
    }
  };

  const getNotificationIcon = (type: string) => {
    if (type === 'alert_overdue') {
      return {
        name: 'time' as const,
        color: DESIGN_COLORS.overdueIcon,
        bg: PALETTE.feedback.errorBg,
      };
    }
    if (type === 'alert_new' || type === 'alert_pending_review') {
      return {
        name: 'warning' as const,
        color: PALETTE.secondary,
        bg: PALETTE.secondaryLight,
      };
    }
    return {
      name: 'notifications' as const,
      color: PALETTE.primary,
      bg: PALETTE.primaryLight,
    };
  };

  const formatNotificationTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${formatShortDate(date)}, ${hours}:${minutes}`;
    } catch {
      return isoString;
    }
  };

  const renderItem = ({ item }: { item: NotificationResponse }) => {
    const isUnread = !item.readAt;
    const icon = getNotificationIcon(item.type);
    const typeLabel = t(`notifications.types.${item.type}`, {
      defaultValue: item.type,
    });
    const unreadSuffix = isUnread ? ` - ${t('notifications.unreadBadge')}` : '';

    return (
      <Pressable
        style={({ pressed }) => [styles.notificationCard, pressed && styles.cardPressed]}
        onPress={() => {
          if (isUnread) {
            void markAsRead(item.id);
          }
          // Cada notificación abre el evento que la originó (NK-33).
          if (item.entityType === 'alert') {
            router.push({
              pathname: APP_ROUTES.PROFESSIONAL.ALERT_DETAIL as never,
              params: { alertId: item.entityId },
            });
          } else if (item.entityType === 'reminder') {
            router.push(APP_ROUTES.CAREGIVER.REMINDERS as never);
          } else if (item.entityType === 'message') {
            // ponytail: abre la lista de mensajes; el chat exige childId/withUserId que la notificación no trae.
            router.push(
              APP_ROUTES[mode === 'caregiver' ? 'CAREGIVER' : 'PROFESSIONAL'].MESSAGES as never,
            );
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel}${unreadSuffix}`}
        testID={`notification-item-${item.id}`}
      >
        <View style={[styles.iconContainer, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={22} color={icon.color} />
        </View>

        <View style={styles.contentContainer}>
          <Text style={[styles.typeTitle, isUnread && styles.typeTitleUnread]}>{typeLabel}</Text>
          <Text style={styles.timestampText}>{formatNotificationTime(item.sentAt)}</Text>
        </View>

        {isUnread && (
          <View
            style={styles.unreadDot}
            testID={`notification-unread-dot-${item.id}`}
            accessibilityLabel={t('notifications.unreadBadge')}
          />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Boton superior Volver */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('actions.goBack')}
          testID="notifications-back-button"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backButtonText}>{t('actions.back')}</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.screenTitle}>{t('notifications.title')}</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer} testID="notifications-loading">
          <ActivityIndicator size="large" color={PALETTE.primary} />
          <Text style={styles.loadingText}>{t('notifications.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer} testID="notifications-error">
          <Ionicons name="alert-circle" size={48} color={PALETTE.feedback.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
            onPress={() => void reload()}
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>{t('notifications.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={
            notifications.length === 0 ? styles.emptyListContainer : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              colors={[PALETTE.primary]}
              tintColor={PALETTE.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer} testID="notifications-empty">
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-outline" size={44} color={PALETTE.text.muted} />
              </View>
              <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
              <Text style={styles.emptySubtitle}>{t('notifications.emptyDescription')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DESIGN_COLORS.surface,
  },
  topBar: {
    backgroundColor: DESIGN_COLORS.surface,
    paddingHorizontal: 30,
    paddingTop: 12,
    paddingBottom: 6,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  header: {
    backgroundColor: DESIGN_COLORS.surface,
    paddingHorizontal: 30,
    paddingTop: 6,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  listContent: {
    paddingHorizontal: 30,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DESIGN_COLORS.surface,
    padding: 16,
    borderRadius: 25,
    gap: 14,
    shadowColor: DESIGN_COLORS.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    gap: 4,
  },
  typeTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  typeTitleUnread: {
    fontWeight: '600',
    color: PALETTE.primary,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PALETTE.secondary,
  },
  timestampText: {
    fontSize: 13,
    fontWeight: '400',
    color: PALETTE.text.muted,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: PALETTE.text.muted,
  },
  errorText: {
    fontSize: 15,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 10,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PALETTE.border.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptySubtitle: {
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
