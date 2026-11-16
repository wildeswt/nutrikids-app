import { Ionicons } from '@expo/vector-icons';
import type { CheckupResponse } from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckupMenuButton } from '../../components/CheckupMenuButton.js';
import { ChildBanner } from '../../components/ChildBanner.js';
import { GrowthChart } from '../../components/GrowthChart.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useOptionalAuth } from '../../context/auth-context.js';
import { useProfessionalCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useReferenceCurves } from '../../hooks/useReferenceCurves.js';
import { formatAgeShort, formatDecimal, formatLongDate } from '../../i18n/format.js';
import { formatCheckupRecorder } from '../../lib/checkup-recorder.js';
import { formatChildAge } from '../../lib/children-api.js';
import {
  INDICATORS,
  checkupsToPoints,
  curvesPositionFor,
  type IndicatorKey,
} from '../../lib/growth-chart.js';

function latestProfessionalCheckup(
  checkups: readonly CheckupResponse[],
): CheckupResponse | undefined {
  return checkups.reduce<CheckupResponse | undefined>(
    (latest, checkup) =>
      !latest || checkup.measuredAt.localeCompare(latest.measuredAt) > 0 ? checkup : latest,
    undefined,
  );
}

export default function ProfessionalChildrenScreen() {
  const { t } = useTranslation(['professional', 'caregiver', 'common']);
  const router = useRouter();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const params = useLocalSearchParams<{ childId?: string }>();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(params.childId ?? null);
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorKey>('PE');
  const [selectedCheckupId, setSelectedCheckupId] = useState<string | null>(null);
  const [showChartInfo, setShowChartInfo] = useState(false);
  const [showSelectedModal, setShowSelectedModal] = useState(false);

  const {
    status: childrenStatus,
    children,
    error: childrenError,
    load: loadChildren,
  } = useChildren();

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  const child =
    children.find((item) => item.id === (selectedChildId ?? params.childId)) ?? children[0] ?? null;

  const {
    status: checkupsStatus,
    checkups,
    error: checkupsError,
    load: loadCheckups,
  } = useProfessionalCheckups(child?.id ?? null);

  // Reloads when coming back (after correcting a checkup).
  useFocusEffect(
    useCallback(() => {
      void loadCheckups();
    }, [loadCheckups]),
  );

  const activeIndicator =
    INDICATORS.find((item) => item.key === selectedIndicator) ?? INDICATORS[0]!;
  const latest = latestProfessionalCheckup(checkups);
  const position = curvesPositionFor(activeIndicator, latest);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.PROFESSIONAL.CHILDREN as never);
  };

  const reloadAfterDelete = () => {
    setSelectedCheckupId(null);
    void loadCheckups();
  };

  const curves = useReferenceCurves(
    child && latest
      ? {
          indicator: activeIndicator.indicator,
          sex: child.sex,
          ...(position ? { position } : {}),
        }
      : null,
  );

  const renderState = (content: ReactNode, testID: string) => (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.scrollContent}>
        <ScreenHeader
          title={t('drawer.evolutionTitle')}
          backLabel={t('common:actions.back')}
          onBack={handleBack}
          style={styles.screenHeader}
          testID="professional-evolution-header"
        />
        <View style={styles.stateBox} testID={testID}>
          {content}
        </View>
      </View>
    </SafeAreaView>
  );

  const retryButton = (onPress: () => void) => (
    <Pressable
      style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      testID="professional-evolution-retry"
    >
      <Text style={styles.stateButtonText}>{t('children.retry')}</Text>
    </Pressable>
  );

  if (childrenStatus === 'idle' || childrenStatus === 'loading') {
    return renderState(
      <>
        <ActivityIndicator color={PALETTE.primary} />
        <Text style={styles.stateText}>{t('children.loading')}</Text>
      </>,
      'professional-evolution-loading',
    );
  }

  if (childrenStatus === 'error') {
    return renderState(
      <>
        <Text style={styles.stateText}>{childrenError ?? t('children.loadError')}</Text>
        {retryButton(() => void loadChildren())}
      </>,
      'professional-evolution-error',
    );
  }

  if (!child) {
    return renderState(
      <>
        <Text style={styles.stateTitle}>{t('children.emptyTitle')}</Text>
        <Text style={styles.stateText}>{t('children.emptySubtitle')}</Text>
      </>,
      'professional-evolution-empty-children',
    );
  }

  if (checkupsStatus === 'idle' || checkupsStatus === 'loading') {
    return renderState(
      <>
        <ActivityIndicator color={PALETTE.primary} />
        <Text style={styles.stateText}>{t('children.loading')}</Text>
      </>,
      'professional-evolution-loading',
    );
  }

  if (checkupsStatus === 'error') {
    return renderState(
      <>
        <Text style={styles.stateText}>{checkupsError ?? t('children.loadError')}</Text>
        {retryButton(() => void loadCheckups())}
      </>,
      'professional-evolution-error',
    );
  }

  if (!latest) {
    return renderState(
      <>
        <Text style={styles.stateTitle}>
          {t('children.noCheckupsTitle', { name: child.firstName })}
        </Text>
        <Text style={styles.stateText}>{t('children.noCheckupsSubtitle')}</Text>
        <Pressable
          style={({ pressed }) => [styles.registerCheckupButton, pressed && styles.pressed]}
          onPress={() =>
            router.push({
              pathname: APP_ROUTES.PROFESSIONAL.ADD_CHECKUP as never,
              params: { childId: child.id },
            })
          }
          accessibilityRole="button"
          testID="professional-register-checkup-empty"
        >
          <Ionicons name="add-circle-outline" size={18} color={PALETTE.text.light} />
          <Text style={styles.registerCheckupButtonText}>{t('children.registerCheckup')}</Text>
        </Pressable>
      </>,
      'professional-evolution-no-checkups',
    );
  }

  const formatTick = (value: number) =>
    activeIndicator.xAxis === 'height'
      ? t('common:units.heightValue', { value })
      : formatAgeShort(value);

  const selectedCheckup =
    (selectedCheckupId ? checkups.find((item) => item.id === selectedCheckupId) : undefined) ??
    latest;
  const selectedIndicatorResult = selectedCheckup.results.find(
    (res) => res.indicator === activeIndicator.indicator,
  );
  const latestIndicatorResult = latest.results.find(
    (res) => res.indicator === activeIndicator.indicator,
  );

  const chartZoneLabels = {
    upper: t('caregiver:evolution.zoneLabels.upper'),
    normal: t('caregiver:evolution.zoneLabels.normal'),
    lower: t('caregiver:evolution.zoneLabels.lower'),
    outer: t('caregiver:evolution.zoneLabels.outer'),
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={t('drawer.evolutionTitle')}
          backLabel={t('common:actions.back')}
          onBack={handleBack}
          style={styles.screenHeader}
          testID="professional-evolution-header"
        />

        {/* Selector de paciente si hay varios niños vinculados */}
        {children.length > 1 ? (
          <View style={styles.patientPillsRow} testID="professional-patient-selector">
            {children.map((item) => {
              const isCurrentChild = item.id === child.id;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.patientPill, isCurrentChild && styles.patientPillActive]}
                  onPress={() => {
                    setSelectedChildId(item.id);
                    setSelectedCheckupId(null);
                  }}
                  accessibilityRole="button"
                  testID={`professional-patient-${item.id}`}
                >
                  <Text
                    style={[styles.patientPillText, isCurrentChild && styles.patientPillTextActive]}
                  >
                    {`${item.firstName} ${item.lastName}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <ChildBanner
          style={styles.childBanner}
          name={`${child.firstName} ${child.lastName}`}
          subtitle={t('children.childSubtitle', {
            age: formatChildAge(child.birthDate),
            birthDate: formatLongDate(child.birthDate),
          })}
        />

        <Pressable
          style={({ pressed }) => [styles.registerCheckupButton, pressed && styles.pressed]}
          onPress={() =>
            router.push({
              pathname: APP_ROUTES.PROFESSIONAL.ADD_CHECKUP as never,
              params: { childId: child.id },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('children.registerCheckup')}
          testID="professional-register-checkup"
        >
          <Ionicons name="add-circle-outline" size={18} color={PALETTE.text.light} />
          <Text style={styles.registerCheckupButtonText}>{t('children.registerCheckup')}</Text>
        </Pressable>

        {/* Selector de los 4 indicadores OMS: P/E, T/E, P/T, IMC/E */}
        <View style={styles.indicatorTabsContainer}>
          {INDICATORS.map((indicator) => {
            const isSelected = indicator.key === selectedIndicator;
            return (
              <Pressable
                key={indicator.key}
                style={[styles.indicatorTab, isSelected && styles.indicatorTabActive]}
                onPress={() => setSelectedIndicator(indicator.key)}
                accessibilityRole="button"
                accessibilityLabel={t(`alerts.indicator.${indicator.indicator}`)}
                testID={`professional-indicator-${indicator.key}`}
              >
                <Text
                  style={[styles.indicatorTabText, isSelected && styles.indicatorTabTextActive]}
                >
                  {t(`caregiver:evolution.indicators.${indicator.key}.code`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Gráfica completa para el profesional: 5 curvas OMS (-3, -2, 0, +2, +3) */}
        <Card style={styles.chartCard} testID="professional-evolution-chart-card">
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleWrapper}>
              <Text style={styles.chartTitleText}>
                {t(`alerts.indicator.${activeIndicator.indicator}`)}
              </Text>
              <Text style={styles.chartSubtitleText}>{t('children.chartSubtitle')}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.infoIconWrapper, pressed && styles.pressed]}
              onPress={() => setShowChartInfo(true)}
              accessibilityRole="button"
              accessibilityLabel={t('children.infoModal.title')}
              testID="professional-chart-info-button"
            >
              <Ionicons name="information-circle-outline" size={26} color={PALETTE.primary} />
            </Pressable>
          </View>

          {curves.status === 'ready' && curves.curves ? (
            <GrowthChart
              curves={curves.curves}
              points={checkupsToPoints(activeIndicator, checkups, child.birthDate)}
              xAxis={activeIndicator.xAxis}
              formatTick={formatTick}
              variant="professional"
              showZoneLabelsInside={false}
              zoneLabels={chartZoneLabels}
              selectedCheckupId={selectedCheckup.id}
              onSelectPoint={(point) => {
                setSelectedCheckupId(point.checkupId ?? null);
                if (point.checkupId) setShowSelectedModal(true);
              }}
              testID="professional-growth-chart"
            />
          ) : curves.status === 'error' ? (
            <View style={styles.chartState} testID="professional-evolution-curves-error">
              <Text style={styles.stateText}>{curves.error ?? t('children.loadError')}</Text>
              {retryButton(() => void curves.load())}
            </View>
          ) : (
            <View style={styles.chartState} testID="professional-evolution-curves-loading">
              <ActivityIndicator color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('children.loading')}</Text>
            </View>
          )}

          <View style={styles.legendGrid} testID="professional-chart-legend">
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotChild]} />
                <Text style={styles.legendText}>{child.firstName}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotOms]} />
                <Text style={styles.legendText}>{chartZoneLabels.normal}</Text>
              </View>
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={styles.legendDashRow}>
                  <View style={styles.legendDash} />
                  <View style={styles.legendDash} />
                </View>
                <Text style={styles.legendTextSecondary}>{chartZoneLabels.outer}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.tapPointHint}>{t('children.tapPointHint')}</Text>
        </Card>

        {/* Último registro con la persona que lo hizo */}
        <Card style={styles.lastRecordCard} testID="professional-evolution-last-record-card">
          <View style={styles.recordHeader}>
            <View style={styles.recordHeaderText}>
              <Text style={styles.recordTitle}>{t('children.lastRecordTitle')}</Text>
              <Text style={styles.recordDate}>{formatLongDate(latest.measuredAt)}</Text>
            </View>
            <CheckupMenuButton
              checkup={latest}
              roleMode="PROFESSIONAL"
              onDeleted={reloadAfterDelete}
              testID="professional-last-record-menu"
            />
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>{t('children.weight')}</Text>
              <Text style={styles.metricValue}>
                {t('common:units.weightValue', { value: formatDecimal(latest.weightKg) })}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>{t('children.height')}</Text>
              <Text style={styles.metricValue}>
                {t('common:units.heightValue', { value: formatDecimal(latest.lengthHeightCm) })}
              </Text>
            </View>
            {latestIndicatorResult ? (
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>{t('children.zScore')}</Text>
                <Text style={styles.metricValue}>
                  {`z = ${formatDecimal(latestIndicatorResult.zScore)}`}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.recordedByRow}>
            <Ionicons name="person" size={18} color={PALETTE.secondary} />
            <Text style={styles.recordedByText}>
              <Text style={styles.recordedByLabel}>{t('children.recordedBy')}</Text>{' '}
              <Text style={styles.recordedByValue}>
                {formatCheckupRecorder({
                  recorder: latest.recordedBy,
                  origin: latest.origin,
                  currentUserId: user?.id,
                  t,
                })}
              </Text>
            </Text>
          </View>
        </Card>
      </ScrollView>

      {/* Modal explicativo de la gráfica */}
      <Modal
        visible={showChartInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChartInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('children.infoModal.title')}</Text>
            <View style={styles.modalItem}>
              <View style={[styles.modalDot, styles.legendDotOms]} />
              <View style={styles.modalItemText}>
                <Text style={styles.modalItemTitle}>{t('children.infoModal.whoBandTitle')}</Text>
                <Text style={styles.modalItemBody}>{t('children.infoModal.whoBand')}</Text>
              </View>
            </View>
            <View style={styles.modalItem}>
              <View style={[styles.modalDot, styles.legendDotChild]} />
              <View style={styles.modalItemText}>
                <Text style={styles.modalItemTitle}>{t('children.infoModal.childLineTitle')}</Text>
                <Text style={styles.modalItemBody}>{t('children.infoModal.childLine')}</Text>
              </View>
            </View>
            <PrimaryButton
              label={t('children.infoModal.close')}
              onPress={() => setShowChartInfo(false)}
              testID="professional-chart-info-close"
            />
          </View>
        </View>
      </Modal>

      {/* Detalle técnico del control seleccionado */}
      <Modal
        visible={showSelectedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSelectedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowSelectedModal(false)}
            accessibilityRole="button"
            accessibilityLabel={t('children.infoModal.close')}
          />
          <ScrollView
            style={styles.checkupModalScroll}
            contentContainerStyle={styles.checkupModalScrollContent}
          >
            <View
              style={styles.checkupModalCard}
              testID="professional-evolution-selected-checkup-card"
            >
              <View style={styles.recordHeader}>
                <View style={styles.recordHeaderText}>
                  <Text style={styles.recordTitle}>{t('children.selectedRecordTitle')}</Text>
                  <Text style={styles.recordDate}>
                    {formatLongDate(selectedCheckup.measuredAt)}
                  </Text>
                </View>
                <CheckupMenuButton
                  checkup={selectedCheckup}
                  roleMode="PROFESSIONAL"
                  onDeleted={() => {
                    setShowSelectedModal(false);
                    reloadAfterDelete();
                  }}
                  testID="professional-selected-checkup-menu"
                />
                <Pressable
                  onPress={() => setShowSelectedModal(false)}
                  style={({ pressed }) => [styles.closeIconButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('children.infoModal.close')}
                  testID="professional-checkup-modal-close"
                >
                  <Ionicons name="close" size={24} color={PALETTE.text.title} />
                </Pressable>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>{t('children.weight')}</Text>
                  <Text style={styles.metricValue}>
                    {t('common:units.weightValue', {
                      value: formatDecimal(selectedCheckup.weightKg),
                    })}
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>{t('children.height')}</Text>
                  <Text style={styles.metricValue}>
                    {t('common:units.heightValue', {
                      value: formatDecimal(selectedCheckup.lengthHeightCm),
                    })}
                  </Text>
                </View>
              </View>

              {selectedIndicatorResult ? (
                <View style={styles.technicalBox} testID="professional-selected-technical-results">
                  <View style={styles.technicalPair}>
                    <View style={styles.metricCell}>
                      <Text style={styles.technicalLabel}>{t('children.zScore')}</Text>
                      <Text style={styles.technicalValue} testID="professional-selected-zscore">
                        {`z = ${formatDecimal(selectedIndicatorResult.zScore, 2)}`}
                      </Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={styles.technicalLabel}>{t('children.percentile')}</Text>
                      <Text style={styles.technicalValue} testID="professional-selected-percentile">
                        {`P${formatDecimal(selectedIndicatorResult.percentile)}`}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.technicalBadge} testID="professional-selected-classification">
                    {t(`children.classifications.${selectedIndicatorResult.classification}`)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.recordedBlock}>
                <Text style={styles.metricLabel}>{t('children.recordedBy')}</Text>
                <Text style={styles.recordedByValue} testID="professional-selected-recorded-by">
                  {formatCheckupRecorder({
                    recorder: selectedCheckup.recordedBy,
                    origin: selectedCheckup.origin,
                    currentUserId: user?.id,
                    t,
                  })}
                </Text>
                {selectedCheckup.notes ? (
                  <Text style={styles.notesValue}>
                    {`${t('children.notes')}: ${selectedCheckup.notes}`}
                  </Text>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 16,
    paddingBottom: 28,
  },
  screenHeader: { paddingHorizontal: 0, paddingTop: 0, marginBottom: 16 },
  patientPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  patientPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
  },
  patientPillActive: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  patientPillText: {
    fontFamily: font('medium'),
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  patientPillTextActive: {
    color: PALETTE.text.light,
  },
  childBanner: {
    marginBottom: 12,
  },
  registerCheckupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  registerCheckupButtonText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.light,
  },
  indicatorTabsContainer: {
    flexDirection: 'row',
    backgroundColor: PALETTE.primary,
    borderRadius: 26,
    padding: 5,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  indicatorTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorTabActive: {
    backgroundColor: PALETTE.text.light,
  },
  indicatorTabText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.light,
  },
  indicatorTabTextActive: {
    color: PALETTE.primary,
  },
  chartCard: {
    padding: 20,
    marginBottom: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chartTitleWrapper: { flex: 1, alignItems: 'center', marginLeft: 26 },
  infoIconWrapper: { padding: 2 },
  chartTitleText: {
    fontFamily: font('semibold'),
    fontSize: 17,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  chartSubtitleText: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 2,
    textAlign: 'center',
  },
  chartState: {
    alignItems: 'center',
    gap: 12,
    height: 180,
    justifyContent: 'center',
    marginBottom: 14,
  },
  legendGrid: {
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.subtle,
    paddingTop: 12,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  legendItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendDotChild: { backgroundColor: PALETTE.secondary },
  legendDotOms: { backgroundColor: '#7FA89E' },
  legendDashRow: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 10 },
  legendDash: { width: 4, height: 2, backgroundColor: '#D9825B', borderRadius: 1 },
  legendTextSecondary: {
    fontFamily: font('regular'),
    fontSize: 11,
    color: PALETTE.text.muted,
  },
  legendText: {
    fontFamily: font('medium'),
    fontSize: 12,
    color: PALETTE.text.body,
    fontWeight: '500',
  },
  tapPointHint: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 10,
    textAlign: 'center',
  },
  selectedRecordCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
  },
  lastRecordCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  recordHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  recordHeaderText: {
    flex: 1,
  },
  recordTitle: {
    fontFamily: font('semibold'),
    fontSize: 17,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  recordDate: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  metricCell: {
    flex: 1,
  },
  metricLabel: {
    fontFamily: font('medium'),
    fontSize: 12,
    color: PALETTE.text.muted,
    fontWeight: '500',
  },
  metricValue: {
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.primary,
    marginTop: 2,
  },
  technicalPair: { flexDirection: 'row', gap: 10 },
  closeIconButton: { padding: 4, marginRight: -4, marginTop: -4 },
  recordedBlock: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.subtle,
    paddingTop: 12,
  },
  technicalBox: {
    marginTop: 14,
    backgroundColor: PALETTE.primaryLight,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  technicalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  technicalLabel: {
    fontFamily: font('medium'),
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  technicalValue: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  technicalBadge: {
    fontFamily: font('semibold'),
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.secondaryPressed,
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border.default,
    marginVertical: 12,
  },
  recordedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordedByLabel: {
    fontFamily: font('medium'),
    fontSize: 14,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  recordedByText: { flex: 1 },
  recordedByValue: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
  },
  notesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  notesValue: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
  },
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  stateTitle: {
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: {
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SCREEN_MARGIN,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: PALETTE.surface,
    borderRadius: RADIUS_PILL,
    padding: 24,
    gap: 16,
    ...CARD_SHADOW,
  },
  modalTitle: {
    fontFamily: font('semibold'),
    fontSize: 20,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  modalItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalDot: { width: 14, height: 14, borderRadius: 7, marginTop: 3 },
  modalItemText: { flex: 1, gap: 2 },
  modalItemTitle: {
    fontFamily: font('semibold'),
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  modalItemBody: {
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
  },
  checkupModalScroll: { width: '100%', maxWidth: 360, maxHeight: '85%', flexGrow: 0 },
  checkupModalScrollContent: { flexGrow: 1, justifyContent: 'center' },
  checkupModalCard: {
    width: '100%',
    backgroundColor: PALETTE.surface,
    borderRadius: RADIUS_PILL,
    padding: 22,
    gap: 12,
    ...CARD_SHADOW,
  },
});
