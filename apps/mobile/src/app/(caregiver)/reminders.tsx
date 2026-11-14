import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse, ReminderResponse } from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
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

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
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
    const date = new Date(reminder.scheduledFor);
    const { day, month } = dateBadgeParts(date);
    return (
      <Card key={reminder.id} style={styles.listCard} testID={`reminder-upcoming-${reminder.id}`}>
        <View style={styles.listCardRow}>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeDay}>{day}</Text>
            <Text style={styles.dateBadgeMonth}>{month}</Text>
          </View>
          <View style={styles.listContent}>
            <Text style={styles.listTime}>{formatTime(date)}</Text>
            <Text style={styles.listTitle}>{typeLabel(reminder)}</Text>
            {childLabel(reminder) ? (
              <Text style={styles.listMeta}>{childLabel(reminder)}</Text>
            ) : (
              <Text style={styles.listMeta}>{whenLabel(reminder)}</Text>
            )}
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
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-forward'}
              size={14}
              color={PALETTE.primary}
            />
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
      </Card>
    );
  };

  const renderCompletedCard = (reminder: ReminderResponse) => (
    <Card key={reminder.id} style={styles.listCard} testID={`reminder-completed-${reminder.id}`}>
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
    </Card>
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
          name={granted ? 'checkmark-circle' : 'notifications-off-outline'}
          size={20}
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
        <ScreenHeader
          title={t('reminders.title')}
          backLabel={t('common:actions.back')}
          onBack={handleBack}
          style={styles.header}
          testID="reminders-header"
        />
        <Text style={styles.subtitle}>{t('reminders.subtitle')}</Text>

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

        {renderNotificationStatus()}

        <View style={styles.createWrapper}>
          <PrimaryButton
            label={t('reminders.create')}
            onPress={handleCreate}
            testID="reminders-create-button"
          />
        </View>
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

const SHORT_MONTHS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
] as const;

function dateBadgeParts(date: Date): { day: string; month: string } {
  if (Number.isNaN(date.getTime())) {
    return { day: '--', month: '' };
  }
  return {
    day: String(date.getDate()),
    month: SHORT_MONTHS[date.getMonth()] ?? '',
  };
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
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.muted,
    marginBottom: 20,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 18,
  },
  notifCardOn: {
    backgroundColor: PALETTE.background,
    borderWidth: 1,
    borderColor: PALETTE.border.subtle,
  },
  notifCardOff: {
    backgroundColor: PALETTE.feedback.warningBg,
    borderWidth: 1,
    borderColor: PALETTE.feedback.warning,
  },
  notifContent: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.text.title,
  },
  notifHint: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  notifButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notifButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 13,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    padding: 4,
    marginBottom: 22,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: PALETTE.surface,
  },
  tabText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.text.light,
  },
  tabTextActive: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
  },
  sectionTitle: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
    marginBottom: 12,
  },
  todayCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: RADIUS_PILL,
    padding: 20,
    marginBottom: 22,
    gap: 14,
    ...CARD_SHADOW,
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
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 17,
  },
  todayMeta: {
    fontFamily: font('regular'),
    color: PALETTE.text.light,
    fontSize: 13,
    opacity: 0.95,
  },
  todayOverdue: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  markButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS_PILL,
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
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
  },
  markButtonTextLight: {
    color: PALETTE.primary,
  },
  markButtonTextDark: {
    color: PALETTE.text.light,
  },
  listCard: {
    padding: 16,
    marginBottom: 12,
  },
  listCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateBadge: {
    width: 48,
    height: 52,
    borderRadius: 14,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadgeDay: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 17,
    color: PALETTE.primary,
    lineHeight: 20,
  },
  dateBadgeMonth: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 11,
    color: PALETTE.primary,
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
  listTime: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 12,
    color: PALETTE.secondary,
  },
  listTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    color: PALETTE.text.title,
  },
  listMeta: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  viewButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
    fontSize: 13,
  },
  detail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.subtle,
    gap: 4,
  },
  detailText: {
    fontFamily: font('regular'),
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
    fontFamily: font('medium'),
    fontWeight: '500',
    color: PALETTE.feedback.error,
    fontSize: 13,
  },
  stateBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  stateTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 17,
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  stateButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 14,
  },
  createWrapper: {
    alignItems: 'center',
    marginTop: 8,
  },
  pressed: {
    opacity: 0.85,
  },
});
