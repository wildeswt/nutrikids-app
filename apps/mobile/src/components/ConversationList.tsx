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
import { RADIUS_PILL, SCREEN_MARGIN } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import { useConversations } from '../hooks/useConversations.js';
import { formatShortDate, formatTime } from '../i18n/format.js';
import i18n from '../i18n/index.js';
import { ChildBanner } from './ChildBanner.js';
import { Card } from './ui/Card.js';
import { PrimaryButton } from './ui/PrimaryButton.js';
import { ScreenHeader } from './ui/ScreenHeader.js';

const LOCAL_COLORS = {
  white: '#FFFFFF',
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

    // En profesional: para cuidadores muestra el nombre del niño y «Cuidador · {nombre}»;
    // para colegas muestra «Interconsulta · {niño}» y «{especialidad} · {nombre}».
    const childFullName = child ? `${child.firstName} ${child.lastName}`.trim() : '';
    if (item.participant.role === 'PROFESSIONAL') {
      const title = childFullName
        ? t('professional:messages.interconsultationTitle', { name: childFullName })
        : t('professional:messages.interconsultationFallback');
      const subtitle = specialtyLabel ? `${specialtyLabel} · ${participantName}` : participantName;
      return { title, subtitle };
    }

    const title = childFullName || participantName;
    const subtitle = childFullName
      ? t('professional:messages.caregiverSubtitle', { name: participantName })
      : t('professional:messages.caregiverFallback');
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
            <Card key={key} style={styles.threadCard}>
              <Pressable
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
              </Pressable>
            </Card>
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
      <ScreenHeader
        title={t('caregiver:messages.title')}
        showBack={Boolean(onBack)}
        onBack={onBack}
        backLabel={t('caregiver:messages.back')}
        style={styles.header}
        testID="conversations-header"
      />

      {mode === 'caregiver' ? (
        <ChildBanner
          name={t('caregiver:messages.banner')}
          style={styles.bannerCard}
          testID="conversations-banner"
        />
      ) : (
        <Text style={styles.professionalSubtitle} testID="conversations-subtitle">
          {t('professional:messages.subtitle')}
        </Text>
      )}

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

      {onNewMessage ? (
        <View style={styles.newMsgWrapper}>
          <PrimaryButton
            label={t('caregiver:messages.newMessage')}
            onPress={onNewMessage}
            testID="conversations-new-message"
          />
        </View>
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
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 0,
    paddingTop: 0,
    marginBottom: 16,
  },
  bannerCard: {
    marginBottom: 20,
  },
  filterPillContainer: {
    flexDirection: 'row',
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    padding: 4,
    marginBottom: 22,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 21,
  },
  filterTabActive: {
    backgroundColor: PALETTE.surface,
  },
  filterTabText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.text.light,
  },
  filterTabTextActive: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
  },
  threadsList: {
    gap: 14,
    marginBottom: 24,
  },
  threadCard: {
    padding: 16,
  },
  threadItem: {
    paddingVertical: 2,
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
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 17,
    color: PALETTE.primary,
    marginBottom: 3,
  },
  threadSubtitle: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    marginBottom: 6,
  },
  threadPreview: {
    fontFamily: font('regular'),
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
    fontFamily: font('regular'),
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
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: LOCAL_COLORS.white,
    fontSize: 11,
  },
  emptyBadgePlaceholder: {
    width: 22,
    height: 22,
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
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 17,
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  retryButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: LOCAL_COLORS.white,
    fontSize: 14,
  },
  disclaimerText: {
    fontFamily: font('regular'),
    fontSize: 12,
    lineHeight: 18,
    color: PALETTE.text.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  newMsgWrapper: {
    alignItems: 'center',
  },
  professionalSubtitle: {
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.muted,
    marginTop: -6,
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.75,
  },
});
