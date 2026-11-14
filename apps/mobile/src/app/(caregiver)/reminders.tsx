import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse, ReminderResponse } from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useNotificationsPermission } from '../../hooks/useNotificationsPermission.js';
import { useReminders } from '../../hooks/useReminders.js';
import { formatLongDate, formatTime } from '../../i18n/format.js';
import { groupReminders } from '../../lib/reminder-form.js';

type ReminderTab = 'upcoming' | 'completed';

const KNOWN_TYPES = ['checkup', 'activity', 'next_checkup'] as const;

export default function RemindersScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string; tab?: string }>();
  const { status, reminders, error, completingIds, load, complete } = useReminders();
  const { children, load: loadChildren } = useChildren();
  const { permission, refresh: refreshPermission, enable } = useNotificationsPermission();

  const [tab, setTab] = useState<ReminderTab>(
    params.tab === 'completed' ? 'completed' : 'upcoming',
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The tabs keep their screens mounted, so everything is read again each time this one is shown.
  useFocusEffect(
    useCallback(() => {
      void load();
      void loadChildren();
      void refreshPermission();
    }, [load, loadChildren, refreshPermission]),
  );

  const childrenById = useMemo(
    () => new Map<string, ChildResponse>(children.map((child) => [child.id, child])),
    [children],
  );
  const visibleReminders = useMemo(
    () =>
      params.childId ? reminders.filter((item) => item.childId === params.childId) : reminders,
    [reminders, params.childId],
  );
  const groups = useMemo(() => groupReminders(visibleReminders), [visibleReminders]);
  const upcomingCount = groups.today.length + groups.upcoming.length;

  const typeLabel = (reminder: ReminderResponse) => {
    const known = KNOWN_TYPES.find((type) => type === reminder.type);
    return t(`reminders.types.${known ?? 'other'}`);
  };
  const childLabel = (reminder: ReminderResponse) => {
    const child = childrenById.get(reminder.childId);
    return child ? t('reminders.forChild', { name: `${child.firstName} ${child.lastName}` }) : null;
  };
  const whenLabel = (reminder: ReminderResponse) => {
    const date = new Date(reminder.scheduledFor);
    return t('common:time.dateAtTime', { date: formatLongDate(date), time: formatTime(date) });
  };

  const handleComplete = async (reminder: ReminderResponse) => {
    setActionError(null);
    try {
      await complete(reminder.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('reminders.markError'));
    }
  };

  const handleCreate = () => {
    router.push({
      pathname: APP_ROUTES.CAREGIVER.ADD_REMINDER as never,
      params: params.childId ? { childId: params.childId } : {},
    });
  };

  const renderMarkDone = (reminder: ReminderResponse, style: 'light' | 'dark') => {
    const busy = completingIds.includes(reminder.id);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.markButton,
          style === 'light' ? styles.markButtonLight : styles.markButtonDark,
          pressed && styles.pressed,
        ]}
        onPress={() => void handleComplete(reminder)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('reminders.markDoneA11y', { title: typeLabel(reminder) })}
        accessibilityState={{ busy, disabled: busy }}
        testID={`reminder-complete-${reminder.id}`}
      >
        <Ionicons
          name="checkmark-circle"
          size={18}
          color={style === 'light' ? PALETTE.primary : PALETTE.text.light}
        />
        <Text
          style={[
            styles.markButtonText,
            style === 'light' ? styles.markButtonTextLight : styles.markButtonTextDark,
          ]}
        >
          {busy ? t('reminders.marking') : t('reminders.markDone')}
        </Text>
      </Pressable>
    );
  };

  const renderTodayCard = (reminder: ReminderResponse, overdue: boolean) => (
    <View key={reminder.id} style={styles.todayCard} testID={`reminder-today-${reminder.id}`}>
      <View style={styles.todayRow}>
        <Ionicons name="calendar-outline" size={40} color={PALETTE.text.light} />
        <View style={styles.todayContent}>
          <Text style={styles.todayTitle}>{typeLabel(reminder)}</Text>
          {childLabel(reminder) ? (
            <Text style={styles.todayMeta}>{childLabel(reminder)}</Text>
          ) : null}
          <Text style={styles.todayMeta}>{whenLabel(reminder)}</Text>
          {overdue ? <Text style={styles.todayOverdue}>{t('reminders.todayOverdue')}</Text> : null}
        </View>
      </View>
      {renderMarkDone(reminder, 'light')}
    </View>
  );

  const renderUpcomingCard = (reminder: ReminderResponse) => {
    const expanded = expandedId === reminder.id;
    return (
      <View key={reminder.id} style={styles.listCard} testID={`reminder-upcoming-${reminder.id}`}>
        <View style={styles.listCardRow}>
          <View style={styles.listIcon}>
            <Ionicons name="calendar" size={22} color={PALETTE.secondary} />
          </View>
          <View style={styles.listContent}>
            <Text style={styles.listTitle}>{typeLabel(reminder)}</Text>
            <Text style={styles.listMeta}>{whenLabel(reminder)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]}
            onPress={() => setExpandedId(expanded ? null : reminder.id)}
            accessibilityRole="button"
            accessibilityLabel={t('reminders.viewAppointmentA11y', { title: typeLabel(reminder) })}
            accessibilityState={{ expanded }}
            testID={`reminder-view-${reminder.id}`}
          >
            <Text style={styles.viewButtonText}>
              {expanded ? t('reminders.hideAppointment') : t('reminders.viewAppointment')}
            </Text>
          </Pressable>
        </View>

        {expanded ? (
          <View style={styles.detail} testID={`reminder-detail-${reminder.id}`}>
            {childLabel(reminder) ? (
              <Text style={styles.detailText}>{childLabel(reminder)}</Text>
            ) : null}
            <Text style={styles.detailText}>{whenLabel(reminder)}</Text>
            <Text style={styles.detailText}>{t(`reminders.status.${reminder.status}`)}</Text>
            {renderMarkDone(reminder, 'dark')}
          </View>
        ) : null}
      </View>
    );
  };

  const renderCompletedCard = (reminder: ReminderResponse) => (
    <View key={reminder.id} style={styles.listCard} testID={`reminder-completed-${reminder.id}`}>
      <View style={styles.listCardRow}>
        <View style={[styles.listIcon, styles.listIconDone]}>
          <Ionicons name="checkmark-circle" size={22} color={PALETTE.primary} />
        </View>
        <View style={styles.listContent}>
          <Text style={styles.listTitle}>{typeLabel(reminder)}</Text>
          {childLabel(reminder) ? (
            <Text style={styles.listMeta}>{childLabel(reminder)}</Text>
          ) : null}
          <Text style={styles.listMeta}>{whenLabel(reminder)}</Text>
        </View>
      </View>
    </View>
  );

  const renderEmpty = (title: string, subtitle: string, testID: string) => (
    <View style={styles.stateBox} testID={testID}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{subtitle}</Text>
    </View>
  );

  const renderNotificationStatus = () => {
    if (permission === null) return null;
    const granted = permission === 'granted';
    const unavailable = permission === 'unavailable';
    return (
      <View
        style={[styles.notifCard, granted ? styles.notifCardOn : styles.notifCardOff]}
        testID="reminders-notifications-status"
      >
        <Ionicons
          name={granted ? 'notifications' : 'notifications-off-outline'}
          size={24}
          color={granted ? PALETTE.primary : PALETTE.feedback.warning}
        />
        <View style={styles.notifContent}>
          <Text style={styles.notifTitle}>
            {granted
              ? t('reminders.notifications.enabled')
              : unavailable
                ? t('reminders.notifications.unavailable')
                : t('reminders.notifications.disabled')}
          </Text>
          {unavailable ? null : (
            <Text style={styles.notifHint}>
              {granted
                ? t('reminders.notifications.enabledHint')
                : t('reminders.notifications.disabledHint')}
            </Text>
          )}
          {permission === 'denied' ? (
            <Pressable
              style={({ pressed }) => [styles.notifButton, pressed && styles.pressed]}
              onPress={() => void enable()}
              accessibilityRole="button"
              accessibilityLabel={t('reminders.notifications.enable')}
              testID="reminders-enable-notifications"
            >
              <Text style={styles.notifButtonText}>{t('reminders.notifications.enable')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const renderBody = () => {
    if (status === 'idle' || (status === 'loading' && reminders.length === 0)) {
      return (
        <View style={styles.stateBox} testID="reminders-loading">
          <ActivityIndicator color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('reminders.loading')}</Text>
        </View>
      );
    }

    if (status === 'error' && reminders.length === 0) {
      return (
        <View style={styles.stateBox} testID="reminders-error">
          <Text style={styles.stateText}>{error ?? t('reminders.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel={t('reminders.retry')}
            testID="reminders-retry"
          >
            <Text style={styles.stateButtonText}>{t('reminders.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (tab === 'completed') {
      return groups.completed.length === 0
        ? renderEmpty(
            t('reminders.emptyCompletedTitle'),
            t('reminders.emptyCompletedSubtitle'),
            'reminders-empty-completed',
          )
        : groups.completed.map(renderCompletedCard);
    }

    if (upcomingCount === 0) {
      return renderEmpty(
        t('reminders.emptyUpcomingTitle'),
        t('reminders.emptyUpcomingSubtitle'),
        'reminders-empty-upcoming',
      );
    }

    return (
      <>
        {groups.today.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{t('reminders.todayTitle')}</Text>
            {groups.today.map((item) => renderTodayCard(item, !isToday(item.scheduledFor)))}
          </>
        ) : null}
        {groups.upcoming.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{t('reminders.upcomingTitle')}</Text>
            {groups.upcoming.map(renderUpcomingCard)}
          </>
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-reminders-screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>{t('reminders.title')}</Text>

        {renderNotificationStatus()}

        <View style={styles.tabs} accessibilityRole="tablist">
          {(['upcoming', 'completed'] as const).map((key) => {
            const selected = tab === key;
            const count = key === 'upcoming' ? upcomingCount : groups.completed.length;
            return (
              <Pressable
                key={key}
                style={[styles.tab, selected && styles.tabActive]}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                testID={`reminders-tab-${key}`}
              >
                <Text style={[styles.tabText, selected && styles.tabTextActive]}>
                  {key === 'upcoming'
                    ? t('reminders.tabUpcoming', { count })
                    : t('reminders.tabCompleted', { count })}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {actionError ? (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            testID="reminders-action-error"
          >
            <Text style={styles.errorBannerText}>{actionError}</Text>
          </View>
        ) : null}

        {renderBody()}

        <Pressable
          style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
          onPress={handleCreate}
          accessibilityRole="button"
          accessibilityLabel={t('reminders.create')}
          testID="reminders-create-button"
        >
          <Ionicons name="add" size={20} color={PALETTE.text.light} />
          <Text style={styles.createButtonText}>{t('reminders.create')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/** `true` when an ISO instant falls on the phone's current calendar day. */
function isToday(iso: string, now: Date = new Date()): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  notifCardOn: {
    backgroundColor: PALETTE.primaryLight,
    borderColor: PALETTE.primary,
  },
  notifCardOff: {
    backgroundColor: PALETTE.feedback.warningBg,
    borderColor: PALETTE.feedback.warning,
  },
  notifContent: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  notifHint: {
    fontSize: 13,
    color: PALETTE.text.body,
  },
  notifButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: PALETTE.primary,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notifButtonText: {
    color: PALETTE.text.light,
    fontSize: 13,
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: PALETTE.border.subtle,
    borderRadius: 24,
    padding: 4,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: PALETTE.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  tabTextActive: {
    color: PALETTE.text.light,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 12,
  },
  todayCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    gap: 14,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  todayContent: {
    flex: 1,
    gap: 3,
  },
  todayTitle: {
    color: PALETTE.text.light,
    fontSize: 17,
    fontWeight: '800',
  },
  todayMeta: {
    color: PALETTE.text.light,
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
  },
  todayOverdue: {
    color: PALETTE.text.light,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  markButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 24,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  markButtonLight: {
    backgroundColor: PALETTE.surface,
  },
  markButtonDark: {
    backgroundColor: PALETTE.primary,
    marginTop: 6,
  },
  markButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  markButtonTextLight: {
    color: PALETTE.primary,
  },
  markButtonTextDark: {
    color: PALETTE.text.light,
  },
  listCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  listCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PALETTE.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listIconDone: {
    backgroundColor: PALETTE.primaryLight,
  },
  listContent: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  listMeta: {
    fontSize: 13,
    color: PALETTE.text.body,
  },
  viewButton: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  viewButtonText: {
    color: PALETTE.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  detail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.default,
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: PALETTE.text.body,
  },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: {
    color: PALETTE.feedback.error,
    fontSize: 13,
    fontWeight: '600',
  },
  stateBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  stateButtonText: {
    color: PALETTE.text.light,
    fontSize: 14,
    fontWeight: '700',
  },
  createButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    height: 54,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  createButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  createButtonText: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
