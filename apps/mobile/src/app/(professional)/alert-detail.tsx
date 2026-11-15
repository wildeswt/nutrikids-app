import { Ionicons } from '@expo/vector-icons';
import {
  canProfessionalTransition,
  type AlertDetailResponse,
  type CheckupResponse,
  type ChildResponse,
} from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { OfflineDataNotice } from '../../components/OfflineDataNotice.js';
import { ZScoreChart } from '../../components/ZScoreChart.js';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useOptionalAuth } from '../../context/auth-context.js';
import { useAlertDetail } from '../../hooks/useAlertDetail.js';
import { usePendingFollowUps } from '../../hooks/usePendingFollowUps.js';
import { formatDecimal, formatLongDate, formatTime } from '../../i18n/format.js';
import { describeZResult, isWideLayout, zSeriesFor } from '../../lib/alert-detail.js';
import { formatCheckupRecorder } from '../../lib/checkup-recorder.js';
import { formatChildAge } from '../../lib/children-api.js';

const MAX_CONTENT_WIDTH = 960;

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueBox}>{children}</View>
    </View>
  );
}

function AlertCard({
  alert,
  checkup,
}: {
  alert: AlertDetailResponse;
  checkup: CheckupResponse | undefined;
}) {
  const { t } = useTranslation(['professional', 'caregiver', 'common']);
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const indicator = t(`alerts.indicator.${alert.indicator}`);
  const result = describeZResult(alert.zScore);
  const resultText =
    result.kind === 'value'
      ? t('alertDetail.result.value', { z: formatDecimal(alert.zScore) })
      : t(`alertDetail.result.${result.kind}`, { limit: result.limit });

  return (
    <View style={styles.section} testID="alert-detail-card">
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>{indicator}</Text>
        <View style={styles.tags}>
          {alert.isSevere && (
            <View style={[styles.pill, styles.pillSevere]} testID="alert-detail-severe">
              <Text style={[styles.pillText, styles.pillSevereText]}>{t('alerts.severe')}</Text>
            </View>
          )}
          {alert.isOverdue && (
            <View style={[styles.pill, styles.pillSevere]} testID="alert-detail-overdue">
              <Text style={[styles.pillText, styles.pillSevereText]}>{t('alerts.overdue')}</Text>
            </View>
          )}
          <View style={styles.pill} testID="alert-detail-status">
            <Text style={styles.pillText}>{t(`alerts.status.${alert.status}`)}</Text>
          </View>
        </View>
      </View>

      <InfoRow label={t('alertDetail.rows.indicator')}>
        <Text style={styles.infoValue}>{indicator}</Text>
      </InfoRow>
      <InfoRow label={t('alertDetail.rows.checkup')}>
        <Text style={styles.infoValue} testID="alert-detail-checkup">
          {checkup
            ? t('alertDetail.checkupValue', {
                date: formatLongDate(checkup.measuredAt),
                weight: t('common:units.weightValue', { value: formatDecimal(checkup.weightKg) }),
                height: t('common:units.heightValue', {
                  value: formatDecimal(checkup.lengthHeightCm),
                }),
              })
            : t('alertDetail.checkupUnknown')}
        </Text>
        {checkup ? (
          <Text style={styles.checkupRecordedBy} testID="alert-detail-checkup-recorded-by">
            {t('alertDetail.checkupRecordedBy', {
              name: formatCheckupRecorder({
                recorder: checkup.recordedBy,
                origin: checkup.origin,
                currentUserId: user?.id,
                t,
              }),
            })}
          </Text>
        ) : null}
        {checkup?.notes ? (
          <Text style={styles.checkupNotes}>
            {t('alertDetail.checkupNotes', { notes: checkup.notes })}
          </Text>
        ) : null}
      </InfoRow>
      <InfoRow label={t('alertDetail.rows.result')}>
        <Text style={[styles.infoValue, styles.infoResult]} testID="alert-detail-result">
          {resultText}
        </Text>
      </InfoRow>
      <InfoRow label={t('alertDetail.rows.reason')}>
        <Text style={styles.infoValue}>{alert.reason}</Text>
      </InfoRow>
    </View>
  );
}

function ChartCard({
  alert,
  child,
  checkups,
  onRetry,
}: {
  alert: AlertDetailResponse;
  child: ChildResponse | null;
  checkups: CheckupResponse[] | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation('professional');
  const indicator = t(`alerts.indicator.${alert.indicator}`);
  const points = checkups ? zSeriesFor(checkups, alert.indicator, alert.checkupId) : [];

  return (
    <Card style={styles.chartCard} testID="alert-detail-chart-card">
      <Text style={styles.chartTitle}>{t('alertDetail.chart.title')}</Text>
      <Text style={styles.chartSubtitle}>{t('alertDetail.chart.subtitle', { indicator })}</Text>

      {checkups === null ? (
        <View style={styles.chartState} testID="alert-detail-chart-error">
          <Text style={styles.mutedText}>{t('alertDetail.chart.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
            onPress={onRetry}
            accessibilityRole="button"
            testID="alert-detail-chart-retry"
          >
            <Text style={styles.smallButtonText}>{t('alertDetail.retry')}</Text>
          </Pressable>
        </View>
      ) : points.length === 0 ? (
        <View style={styles.chartState} testID="alert-detail-chart-empty">
          <Text style={styles.mutedText}>{t('alertDetail.chart.empty')}</Text>
        </View>
      ) : (
        <View
          accessible
          accessibilityLabel={t('alertDetail.chart.a11y', {
            indicator,
            count: points.length,
            z: formatDecimal(alert.zScore),
          })}
        >
          <ZScoreChart points={points} />
        </View>
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotChild]} />
          <Text style={styles.legendText}>{child?.firstName ?? t('alertDetail.unknownChild')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotAlert]} />
          <Text style={styles.legendText}>{t('alertDetail.chart.legendAlert')}</Text>
        </View>
      </View>
    </Card>
  );
}

function HistoryCard({ history }: { history: AlertDetailResponse['history'] }) {
  const { t } = useTranslation('professional');
  return (
    <View style={styles.section} testID="alert-detail-history">
      <Text style={styles.sectionTitle}>{t('alertDetail.history.title')}</Text>
      <View style={styles.timeline}>
        <View style={styles.timelineRailRow}>
          {history.map((entry, index) => {
            const isLast = index === history.length - 1;
            return (
              <React.Fragment key={`rail-${entry.status}-${entry.changedAt}`}>
                {index > 0 ? <View style={styles.timelineLine} /> : null}
                <View style={[styles.timelineDot, isLast && styles.timelineDotCurrent]} />
              </React.Fragment>
            );
          })}
        </View>

        <View style={styles.timelineLabelsRow}>
          {history.map((entry, index) => {
            const isFirst = index === 0;
            const isLast = index === history.length - 1;
            const alignStyle =
              history.length === 1 || isFirst
                ? styles.timelineEntryStart
                : isLast
                  ? styles.timelineEntryEnd
                  : styles.timelineEntryCenter;
            const textAlignStyle =
              history.length === 1 || isFirst
                ? styles.textLeft
                : isLast
                  ? styles.textRight
                  : styles.textCenter;
            const when = new Date(entry.changedAt);
            return (
              <View
                key={`${entry.status}-${entry.changedAt}`}
                style={[styles.timelineEntry, alignStyle]}
                testID={`alert-detail-history-entry-${index}`}
              >
                <Text style={[styles.timelineStatus, textAlignStyle]}>
                  {t(`alerts.status.${entry.status}`)}
                </Text>
                <Text style={[styles.timelineMeta, textAlignStyle]}>
                  {t('alertDetail.history.entry', {
                    date: formatLongDate(when),
                    time: formatTime(when),
                  })}
                </Text>
                <Text style={[styles.timelineMeta, textAlignStyle]}>
                  {t('alertDetail.history.by', { name: entry.changedByName })}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function AlertDetailScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const auth = useOptionalAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const userId = auth?.user?.id ?? null;
  const detailArgs: [string | undefined, { userId?: string | null }?] = userId
    ? [alertId, { userId }]
    : [alertId];
  const {
    alert,
    child,
    checkups,
    loading,
    error,
    marking,
    actionError,
    fromCache,
    stale,
    lastSyncedAt,
    reload,
    markReviewed,
  } = useAlertDetail(...detailArgs);

  const { pendingCount, syncPending } = usePendingFollowUps(alertId);

  // On focus, send the follow-ups saved without connection and reload: coming back from the
  // follow-up form shows the new status and history.
  useFocusEffect(
    useCallback(() => {
      void syncPending().finally(() => reload());
    }, [syncPending, reload]),
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.PROFESSIONAL.ALERTS);
  };

  const openFollowUp = () => {
    if (!alert) return;
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.FOLLOW_UP as never,
      params: { alertId: alert.id, childId: alert.childId },
    });
  };

  const openReferral = () => {
    if (!alert) return;
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.REFERRAL as never,
      params: { childId: alert.childId },
    });
  };

  const header = (
    <ScreenHeader
      title={t('alertDetail.title')}
      backLabel={t('common:actions.back')}
      onBack={goBack}
      testID="alert-detail"
    />
  );

  // Full-screen states: first load or the alert could not be loaded. A reload on focus keeps the
  // content visible.
  if (!alert) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.content} testID="alert-detail-screen">
          {header}
          {loading || !error ? (
            <View style={styles.centerBox} testID="alert-detail-loading">
              <ActivityIndicator size="large" color={PALETTE.primary} />
              <Text style={styles.mutedText}>{t('alertDetail.loading')}</Text>
            </View>
          ) : (
            <View style={styles.centerBox} testID="alert-detail-error">
              <Ionicons name="alert-circle" size={48} color={PALETTE.feedback.error} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
                onPress={() => void reload()}
                accessibilityRole="button"
                testID="alert-detail-retry"
              >
                <Text style={styles.smallButtonText}>{t('alertDetail.retry')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const checkup = checkups?.find((item) => item.id === alert.checkupId);
  const canReview = canProfessionalTransition(alert.status, 'REVIEWED');
  const established = alert.status === 'FOLLOW_UP_ESTABLISHED';
  const wide = isWideLayout(width);

  const actions = (
    <View style={styles.actions} testID="alert-detail-actions">
      {pendingCount > 0 && (
        <Text style={styles.noteText} testID="alert-detail-pending">
          {t('alertDetail.pending', { count: pendingCount })}
        </Text>
      )}
      {actionError && (
        <Text style={styles.actionError} testID="alert-detail-action-error">
          {actionError}
        </Text>
      )}
      {canReview && (
        <PrimaryButton
          label={marking ? t('alertDetail.actions.marking') : t('alertDetail.actions.markReviewed')}
          onPress={() => void markReviewed()}
          disabled={marking}
          loading={marking}
          testID="alert-detail-mark-reviewed"
        />
      )}
      {alert.status === 'REVIEWED' && (
        <Text style={styles.noteText} testID="alert-detail-reviewed-note">
          {t('alertDetail.actions.reviewedNote')}
        </Text>
      )}
      {established ? (
        <Text style={styles.noteText} testID="alert-detail-established-note">
          {t('alertDetail.actions.establishedNote')}
        </Text>
      ) : (
        <SecondaryButton
          label={t('alertDetail.actions.followUp')}
          onPress={openFollowUp}
          testID="alert-detail-follow-up"
        />
      )}
      <SecondaryButton
        label={t('alertDetail.actions.referral')}
        onPress={openReferral}
        testID="alert-detail-referral"
      />
    </View>
  );

  const alertCard = <AlertCard alert={alert} checkup={checkup} />;
  const chartCard = (
    <ChartCard alert={alert} child={child} checkups={checkups} onRetry={() => void reload()} />
  );
  const historyCard = <HistoryCard history={alert.history} />;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="alert-detail-screen"
      >
        <View style={styles.content}>
          {header}
          <ChildBanner
            name={child ? `${child.firstName} ${child.lastName}` : t('alertDetail.unknownChild')}
            subtitle={
              child
                ? t('alertDetail.childSubtitle', {
                    age: formatChildAge(child.birthDate),
                    birthDate: formatLongDate(child.birthDate),
                  })
                : undefined
            }
          />
          <OfflineDataNotice
            fromCache={fromCache}
            stale={stale}
            lastSyncedAt={lastSyncedAt}
            testID="alert-detail-offline-notice"
          />

          {wide ? (
            <View style={styles.columns} testID="alert-detail-wide">
              <View style={styles.column}>
                {alertCard}
                {historyCard}
              </View>
              <View style={styles.column}>
                {chartCard}
                {actions}
              </View>
            </View>
          ) : (
            <View style={styles.stack} testID="alert-detail-narrow">
              {alertCard}
              {chartCard}
              {historyCard}
              {actions}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  scrollContent: { paddingBottom: 32 },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    gap: 18,
  },
  pressed: { opacity: 0.8 },
  stack: { gap: 20 },
  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  column: { flex: 1, gap: 20 },
  section: { gap: 10 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontFamily: font('medium'),
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
    flexShrink: 1,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  pill: {
    backgroundColor: PALETTE.secondary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pillText: {
    fontFamily: font('semibold'),
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.text.light,
  },
  pillSevere: { backgroundColor: PALETTE.feedback.errorBg },
  pillSevereText: { color: PALETTE.feedback.error },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoLabel: {
    width: 84,
    fontFamily: font('medium'),
    fontSize: 14,
    fontWeight: '500',
    color: PALETTE.primary,
  },
  infoValueBox: { flex: 1 },
  infoValue: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
  },
  checkupNotes: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    marginTop: 4,
  },
  checkupRecordedBy: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    marginTop: 4,
  },
  infoResult: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.secondaryPressed,
  },
  chartCard: {
    padding: 18,
    gap: 10,
  },
  chartTitle: {
    fontFamily: font('medium'),
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  chartSubtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  chartState: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendDotChild: { backgroundColor: PALETTE.secondary },
  legendDotAlert: { backgroundColor: PALETTE.secondary, borderWidth: 3, borderColor: '#FBC6B0' },
  legendText: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.body,
  },
  timeline: { gap: 8, paddingTop: 4 },
  timelineRailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: PALETTE.primary,
  },
  timelineDotCurrent: { backgroundColor: PALETTE.secondary },
  timelineLine: {
    flex: 1,
    height: 3,
    backgroundColor: PALETTE.primary,
  },
  timelineLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineEntry: { flex: 1, gap: 2 },
  timelineEntryStart: { alignItems: 'flex-start' },
  timelineEntryCenter: { alignItems: 'center' },
  timelineEntryEnd: { alignItems: 'flex-end' },
  textLeft: { textAlign: 'left' },
  textCenter: { textAlign: 'center' },
  textRight: { textAlign: 'right' },
  timelineStatus: {
    fontFamily: font('medium'),
    fontSize: 14,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  timelineMeta: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  actions: { gap: 12 },
  actionError: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  noteText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  centerBox: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  mutedText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  smallButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS_PILL,
  },
  smallButtonText: {
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '600',
  },
});
