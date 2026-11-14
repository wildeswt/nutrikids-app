import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse, ConversationResponse } from '@nutrikids/shared';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../constants/colors.js';
import { useConversations } from '../hooks/useConversations.js';
import { formatShortDate, formatTime } from '../i18n/format.js';
import i18n from '../i18n/index.js';

const LOCAL_COLORS = {
  white: '#FFFFFF',
  pillTrack: '#FFEADF',
  divider: '#E5E7EB',
} as const;

export interface ConversationListProps {
  mode: 'caregiver' | 'professional';
  childrenList?: readonly ChildResponse[];
  onBack?: () => void;
  onRefreshExtra?: () => Promise<void> | void;
  onSelectConversation: (conversation: ConversationResponse) => void;
  onNewMessage?: () => void;
}

/** Formatea la fecha/hora de una conversación: hora si es hoy, «Ayer» o fecha corta. */
export function formatConversationTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, now)) {
    return formatTime(date);
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return i18n.t('common:time.yesterday');
  }
  return formatShortDate(date);
}

/**
 * Lista compartida de conversaciones para cuidador y profesional (NK-50, RF-19).
 * En cuidador muestra «Equipo de {niño}»; en profesional muestra nombre, apellido y especialidad.
 */
export function ConversationList({
  mode,
  childrenList = [],
  onBack,
  onRefreshExtra,
  onSelectConversation,
  onNewMessage,
}: ConversationListProps) {
  const { t } = useTranslation(['caregiver', 'professional', 'common']);
  const { conversations, loading, refreshing, error, unreadTotal, reload, refresh } =
    useConversations();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const childrenById = useMemo(
    () => new Map(childrenList.map((child) => [child.id, child])),
    [childrenList],
  );

  const filteredConversations = useMemo(
    () => (filter === 'unread' ? conversations.filter((c) => c.unreadCount > 0) : conversations),
    [conversations, filter],
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), Promise.resolve(onRefreshExtra?.())]);
  }, [onRefreshExtra, refresh]);

  const describeRow = (item: ConversationResponse) => {
    const participantName = `${item.participant.firstName} ${item.participant.lastName}`.trim();
    const specialtyLabel = item.participant.specialty
      ? t(`common:specialties.${item.participant.specialty}`, {
          defaultValue: item.participant.specialty,
        })
      : null;
    const child = childrenById.get(item.childId);

    if (mode === 'caregiver') {
      const title = child
        ? t('caregiver:messages.childTeam', { name: child.firstName })
        : participantName;
      const subtitle = specialtyLabel
        ? t('caregiver:messages.teamSubtitle', {
            specialty: specialtyLabel,
            professional: participantName,
          })
        : child
          ? participantName
          : '';
      return { title, subtitle };
    }

    // En profesional no aplica «Equipo de {niño}»: muestra nombre, apellido y especialidad si aplica.
    const title = participantName;
    let subtitle = '';
    if (item.participant.role === 'PROFESSIONAL' && specialtyLabel) {
      subtitle = child
        ? `${specialtyLabel} · ${child.firstName} ${child.lastName}`
        : specialtyLabel;
    } else if (child) {
      subtitle = t('caregiver:chat.about', { name: `${child.firstName} ${child.lastName}` });
    }
    return { title, subtitle };
  };

  const renderBody = () => {
    if (loading && !refreshing && conversations.length === 0) {
      return (
        <View style={styles.stateBox} testID="conversations-loading">
          <ActivityIndicator size="large" color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('caregiver:messages.loading')}</Text>
        </View>
      );
    }

    if (error && conversations.length === 0) {
      return (
        <View style={styles.stateBox} testID="conversations-error">
          <Ionicons name="alert-circle-outline" size={40} color={PALETTE.feedback.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={() => void reload()}
            accessibilityRole="button"
            accessibilityLabel={t('caregiver:messages.retry')}
            testID="conversations-retry"
          >
            <Text style={styles.retryButtonText}>{t('caregiver:messages.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (conversations.length === 0) {
      return (
        <View style={styles.stateBox} testID="conversations-empty">
          <Ionicons name="chatbubbles-outline" size={42} color={PALETTE.text.muted} />
          <Text style={styles.emptyTitle}>{t('caregiver:messages.emptyTitle')}</Text>
          <Text style={styles.stateText}>
            {mode === 'caregiver'
              ? t('caregiver:messages.emptySubtitle')
              : t('professional:messages.emptySubtitle')}
          </Text>
        </View>
      );
    }

    if (filteredConversations.length === 0) {
      return (
        <View style={styles.stateBox} testID="conversations-empty-unread">
          <Text style={styles.emptyTitle}>{t('caregiver:messages.emptyUnreadTitle')}</Text>
          <Text style={styles.stateText}>{t('caregiver:messages.emptyUnreadSubtitle')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.threadsList}>
        {filteredConversations.map((item) => {
          const { title, subtitle } = describeRow(item);
          const timeLabel = formatConversationTime(item.lastMessage.sentAt);
          const key = `${item.childId}:${item.participant.userId}`;
          return (
            <Pressable
              key={key}
              style={({ pressed }) => [styles.threadItem, pressed && styles.pressed]}
              onPress={() => onSelectConversation(item)}
              accessibilityRole="button"
              accessibilityLabel={t('caregiver:messages.threadA11y', { title })}
              testID={`conversation-item-${item.childId}-${item.participant.userId}`}
            >
              <View style={styles.threadMainRow}>
                <View style={styles.threadContent}>
                  <Text style={styles.threadTitle}>{title}</Text>
                  {subtitle ? <Text style={styles.threadSubtitle}>{subtitle}</Text> : null}
                  <Text style={styles.threadPreview} numberOfLines={2}>
                    {item.lastMessage.body}
                  </Text>
                </View>

                <View style={styles.threadMetaColumn}>
                  <Text style={styles.threadTime}>{timeLabel}</Text>
                  {item.unreadCount > 0 ? (
                    <View
                      style={styles.unreadBadge}
                      testID={`conversation-unread-${item.childId}-${item.participant.userId}`}
                    >
                      <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyBadgePlaceholder} />
                  )}
                </View>
              </View>

              <View style={styles.threadDivider} />
            </Pressable>
          );
        })}
      </View>
    );
  };

  const content = (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          colors={[PALETTE.primary]}
          tintColor={PALETTE.primary}
        />
      }
    >
      {onBack ? (
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('caregiver:messages.back')}
          testID="conversations-back-button"
        >
          <Ionicons name="chevron-back" size={20} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('caregiver:messages.back')}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.screenTitle}>{t('caregiver:messages.title')}</Text>

      <View style={styles.bannerCard}>
        <Text style={styles.bannerText}>
          {mode === 'caregiver'
            ? t('caregiver:messages.banner')
            : t('professional:messages.banner')}
        </Text>
      </View>

      <View style={styles.filterPillContainer}>
        <Pressable
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
          accessibilityRole="button"
          accessibilityLabel={t('caregiver:messages.filterAllA11y')}
          testID="conversations-filter-all"
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            {t('caregiver:messages.filterAll')}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
          onPress={() => setFilter('unread')}
          accessibilityRole="button"
          accessibilityLabel={t('caregiver:messages.filterUnreadA11y')}
          testID="conversations-filter-unread"
        >
          <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
            {t('caregiver:messages.filterUnread', { count: unreadTotal })}
          </Text>
        </Pressable>
      </View>

      {renderBody()}

      <Text style={styles.disclaimerText}>
        {mode === 'caregiver'
          ? t('caregiver:messages.emergencyNotice')
          : t('professional:messages.emergencyNotice')}
      </Text>

      {/* En el profesional no hay "Nuevo mensaje" en esta tarea (NK-50): solo responde en conversaciones existentes. */}
      {mode === 'caregiver' && onNewMessage ? (
        <Pressable
          style={({ pressed }) => [styles.newMsgButton, pressed && styles.newMsgButtonPressed]}
          onPress={onNewMessage}
          accessibilityRole="button"
          accessibilityLabel={t('caregiver:messages.newMessage')}
          testID="conversations-new-message"
        >
          <Text style={styles.newMsgButtonText}>{t('caregiver:messages.newMessage')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  if (mode === 'caregiver') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {content}
      </SafeAreaView>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  bannerCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 18,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  bannerText: {
    color: LOCAL_COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  filterPillContainer: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: LOCAL_COLORS.pillTrack,
    borderRadius: 22,
    padding: 3,
    marginBottom: 24,
  },
  filterTab: {
    paddingVertical: 7,
    paddingHorizontal: 28,
    borderRadius: 18,
  },
  filterTabActive: {
    backgroundColor: PALETTE.secondary,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  filterTabTextActive: {
    color: LOCAL_COLORS.white,
    fontWeight: '700',
  },
  threadsList: {
    marginBottom: 28,
  },
  threadItem: {
    paddingVertical: 6,
  },
  threadMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  threadContent: {
    flex: 1,
    paddingRight: 12,
  },
  threadTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: PALETTE.primary,
    marginBottom: 3,
  },
  threadSubtitle: {
    fontSize: 12,
    color: PALETTE.text.muted,
    marginBottom: 6,
  },
  threadPreview: {
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 19,
  },
  threadMetaColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  threadTime: {
    fontSize: 12,
    color: PALETTE.text.muted,
    marginBottom: 8,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: PALETTE.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: LOCAL_COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBadgePlaceholder: {
    width: 22,
    height: 22,
  },
  threadDivider: {
    height: 1,
    backgroundColor: LOCAL_COLORS.divider,
    marginTop: 18,
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: PALETTE.primary,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: LOCAL_COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    color: PALETTE.text.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 28,
  },
  newMsgButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  newMsgButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  newMsgButtonText: {
    color: LOCAL_COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
