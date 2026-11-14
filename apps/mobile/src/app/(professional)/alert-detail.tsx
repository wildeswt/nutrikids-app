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
import { ZScoreChart } from '../../components/ZScoreChart.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAlertDetail } from '../../hooks/useAlertDetail.js';
import { usePendingFollowUps } from '../../hooks/usePendingFollowUps.js';
import { formatDecimal, formatLongDate, formatTime } from '../../i18n/format.js';
import { describeZResult, isWideLayout, zSeriesFor } from '../../lib/alert-detail.js';
import { formatChildAge } from '../../lib/children-api.js';

const MAX_CONTENT_WIDTH = 960;

function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

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
  const { t } = useTranslation(['professional', 'common']);
  const indicator = t(`alerts.indicator.${alert.indicator}`);
  const result = describeZResult(alert.zScore);
  const resultText =
    result.kind === 'value'
      ? t('alertDetail.result.value', { z: formatDecimal(alert.zScore) })
      : t(`alertDetail.result.${result.kind}`, { limit: result.limit });

  return (
    <Card testID="alert-detail-card">
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{indicator}</Text>
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
      </InfoRow>
      <InfoRow label={t('alertDetail.rows.result')}>
        <Text style={[styles.infoValue, styles.infoResult]} testID="alert-detail-result">
          {resultText}
        </Text>
      </InfoRow>
      <InfoRow label={t('alertDetail.rows.reason')}>
        <Text style={styles.infoValue}>{alert.reason}</Text>
      </InfoRow>
    </Card>
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
    <Card testID="alert-detail-chart-card">
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
    <Card testID="alert-detail-history">
      <Text style={styles.cardTitle}>{t('alertDetail.history.title')}</Text>
      <View style={styles.timeline}>
        {history.map((entry, index) => {
          const isLast = index === history.length - 1;
          const when = new Date(entry.changedAt);
          return (
            <View
              key={`${entry.status}-${entry.changedAt}`}
              style={styles.timelineRow}
              testID={`alert-detail-history-entry-${index}`}
            >
              <View style={styles.timelineRail}>
                <View style={[styles.timelineDot, isLast && styles.timelineDotCurrent]} />
                {!isLast && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineBody}>
                <Text style={styles.timelineStatus}>{t(`alerts.status.${entry.status}`)}</Text>
                <Text style={styles.timelineMeta}>
                  {t('alertDetail.history.by', { name: entry.changedByName })}
                </Text>
                <Text style={styles.timelineMeta}>
                  {t('alertDetail.history.entry', {
                    date: formatLongDate(when),
                    time: formatTime(when),
                  })}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export default function AlertDetailScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const { alert, child, checkups, loading, error, marking, actionError, reload, markReviewed } =
    useAlertDetail(alertId);

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

  const backButton = (
    <Pressable
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      onPress={goBack}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('common:actions.goBack')}
      testID="alert-detail-back"
    >
      <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
      <Text style={styles.backText}>{t('common:actions.back')}</Text>
    </Pressable>
  );

  const title = <Text style={styles.screenTitle}>{t('alertDetail.title')}</Text>;

  // Full-screen states: first load or the alert could not be loaded. A reload on focus keeps the
  // content visible.
  if (!alert) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.content} testID="alert-detail-screen">
          {backButton}
          {title}
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
        <Pressable
          style={({ pressed }) => [styles.primaryButton, (pressed || marking) && styles.pressed]}
          onPress={() => void markReviewed()}
          disabled={marking}
          accessibilityRole="button"
          accessibilityState={{ disabled: marking, busy: marking }}
          testID="alert-detail-mark-reviewed"
        >
          <Text style={styles.primaryButtonText}>
            {marking ? t('alertDetail.actions.marking') : t('alertDetail.actions.markReviewed')}
          </Text>
        </Pressable>
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
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={openFollowUp}
          accessibilityRole="button"
          testID="alert-detail-follow-up"
        >
          <Text style={styles.secondaryButtonText}>{t('alertDetail.actions.followUp')}</Text>
        </Pressable>
      )}
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
          {backButton}
          {title}
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
    paddingHorizontal: 30,
    paddingTop: 12,
    gap: 16,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 18, fontWeight: '500', color: PALETTE.text.title },
  screenTitle: { fontSize: 30, fontWeight: '800', color: PALETTE.text.title },
  pressed: { opacity: 0.8 },
  stack: { gap: 16 },
  columns: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  column: { flex: 1, gap: 16 },
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: 25,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.text.title },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: PALETTE.text.light },
  pillSevere: { backgroundColor: PALETTE.feedback.errorBg },
  pillSevereText: { color: PALETTE.feedback.error },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoLabel: { width: 84, fontSize: 14, fontWeight: '600', color: PALETTE.primary },
  infoValueBox: { flex: 1 },
  infoValue: { fontSize: 15, color: PALETTE.text.body },
  infoResult: { fontWeight: '700', color: PALETTE.secondaryPressed },
  chartTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.text.title, textAlign: 'center' },
  chartSubtitle: { fontSize: 13, color: PALETTE.text.muted, textAlign: 'center' },
  chartState: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendDotChild: { backgroundColor: PALETTE.secondary },
  legendDotAlert: { backgroundColor: PALETTE.secondary, borderWidth: 3, borderColor: '#FBC6B0' },
  legendText: { fontSize: 12, color: PALETTE.text.body },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { alignItems: 'center', width: 14 },
  timelineDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: PALETTE.primary },
  timelineDotCurrent: { backgroundColor: PALETTE.secondary },
  timelineLine: { flex: 1, width: 3, backgroundColor: PALETTE.primary, marginVertical: 2 },
  timelineBody: { flex: 1, paddingBottom: 16, gap: 2 },
  timelineStatus: { fontSize: 15, fontWeight: '700', color: PALETTE.text.title },
  timelineMeta: { fontSize: 12, color: PALETTE.text.muted },
  actions: { gap: 12 },
  actionError: { fontSize: 14, color: PALETTE.feedback.error, textAlign: 'center' },
  noteText: { fontSize: 14, color: PALETTE.text.muted, textAlign: 'center' },
  primaryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 25,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: PALETTE.text.light, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderRadius: 25,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: PALETTE.primary,
    backgroundColor: PALETTE.surface,
  },
  secondaryButtonText: { color: PALETTE.primary, fontSize: 16, fontWeight: '700' },
  centerBox: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  mutedText: { fontSize: 14, color: PALETTE.text.muted, textAlign: 'center' },
  errorText: { fontSize: 15, color: PALETTE.feedback.error, textAlign: 'center' },
  smallButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  smallButtonText: { color: PALETTE.text.light, fontSize: 15, fontWeight: '600' },
});
