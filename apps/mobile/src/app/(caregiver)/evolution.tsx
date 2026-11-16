import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { ChildBannerSelector } from '../../components/ChildBannerSelector.js';
import { GrowthChart } from '../../components/GrowthChart.js';
import { OfflineDataNotice } from '../../components/OfflineDataNotice.js';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useOptionalAuth } from '../../context/auth-context.js';
import { useCheckups, type CaregiverCheckupListItem } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useReferenceCurves } from '../../hooks/useReferenceCurves.js';
import { formatAgeShort, formatDecimal, formatLongDate } from '../../i18n/format.js';
import { formatCheckupRecorder } from '../../lib/checkup-recorder.js';
import { formatChildAge } from '../../lib/children-api.js';
import {
  INDICATORS,
  checkupsToPoints,
  curvesPositionFor,
  latestCheckup,
  type IndicatorKey,
} from '../../lib/growth-chart.js';

export default function EvolutionScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorKey>('PE');
  const [showChartInfo, setShowChartInfo] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [selectedCheckupId, setSelectedCheckupId] = useState<string | null>(null);
  const [modalCheckup, setModalCheckup] = useState<CaregiverCheckupListItem | null>(null);

  const {
    status: childrenStatus,
    children,
    error: childrenError,
    fromCache: childrenFromCache,
    stale: childrenStale,
    lastSyncedAt: childrenLastSyncedAt,
    loadError: childrenLoadError,
    load: loadChildren,
  } = useChildren();
  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // A child sent through the route params (e.g. from the home) replaces the manual choice.
  useEffect(() => {
    setSelectedChildId(null);
  }, [params.childId]);

  const child =
    children.find((item) => item.id === (selectedChildId ?? params.childId)) ?? children[0] ?? null;

  const {
    status: checkupsStatus,
    checkups,
    error: checkupsError,
    fromCache: checkupsFromCache,
    stale: checkupsStale,
    lastSyncedAt: checkupsLastSyncedAt,
    loadError: checkupsLoadError,
    load: loadCheckups,
  } = useCheckups(child?.id ?? null);

  // Recarga niños, controles y tendencia al enfocar la pestaña Evolución (NK-74)
  useFocusEffect(
    useCallback(() => {
      void loadChildren();
      void loadCheckups();
    }, [loadChildren, loadCheckups]),
  );

  const activeIndicator =
    INDICATORS.find((item) => item.key === selectedIndicator) ?? INDICATORS[0]!;
  const latest = latestCheckup(checkups);
  const position = curvesPositionFor(activeIndicator, latest);

  const reloadAfterDelete = () => {
    setSelectedCheckupId(null);
    void loadCheckups();
  };

  // The reference curves are requested once the child has at least one checkup to plot.
  const curves = useReferenceCurves(
    child && latest
      ? {
          indicator: activeIndicator.indicator,
          sex: child.sex,
          ...(position ? { position } : {}),
        }
      : null,
  );

  /** Screen without the child's data yet: loading, error with retry or empty state. */
  const renderState = (content: ReactNode, testID: string) => (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.scrollContent}>
        <ScreenHeader
          title={child ? t('evolution.title', { name: child.firstName }) : t('tabs.evolution')}
          showBack={false}
          style={styles.screenHeader}
          testID="evolution-header"
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
      accessibilityLabel={t('evolution.retry')}
      testID="evolution-retry"
    >
      <Text style={styles.stateButtonText}>{t('evolution.retry')}</Text>
    </Pressable>
  );

  if (childrenStatus === 'idle' || childrenStatus === 'loading') {
    return renderState(
      <>
        <ActivityIndicator color={PALETTE.primary} />
        <Text style={styles.stateText}>{t('evolution.loading')}</Text>
      </>,
      'evolution-loading',
    );
  }

  if (childrenStatus === 'error') {
    const needsConnection = childrenLoadError === 'needs-connection';
    const fallbackError = childrenError ?? t('evolution.loadError');
    const message = needsConnection ? t('common:offline.noDataMessage') : fallbackError;
    return renderState(
      <>
        {needsConnection ? (
          <Ionicons name="cloud-offline-outline" size={32} color={PALETTE.primary} />
        ) : null}
        <Text style={styles.stateText}>{message}</Text>
        {retryButton(() => void loadChildren())}
      </>,
      needsConnection ? 'evolution-needs-connection' : 'evolution-error',
    );
  }

  if (!child) {
    return renderState(
      <>
        <Text style={styles.stateTitle}>{t('evolution.emptyChildrenTitle')}</Text>
        <Text style={styles.stateText}>{t('evolution.emptyChildrenSubtitle')}</Text>
      </>,
      'evolution-empty-children',
    );
  }

  if (checkupsStatus === 'idle' || checkupsStatus === 'loading') {
    return renderState(
      <>
        <ActivityIndicator color={PALETTE.primary} />
        <Text style={styles.stateText}>{t('evolution.loading')}</Text>
      </>,
      'evolution-loading',
    );
  }

  if (checkupsStatus === 'error') {
    const needsConnection = checkupsLoadError === 'needs-connection';
    const fallbackError = checkupsError ?? t('evolution.loadError');
    const message = needsConnection ? t('common:offline.noDataMessage') : fallbackError;
    return renderState(
      <>
        {needsConnection ? (
          <Ionicons name="cloud-offline-outline" size={32} color={PALETTE.primary} />
        ) : null}
        <Text style={styles.stateText}>{message}</Text>
        {retryButton(() => void loadCheckups())}
      </>,
      needsConnection ? 'evolution-needs-connection' : 'evolution-error',
    );
  }

  if (!latest) {
    return renderState(
      <>
        <OfflineDataNotice
          fromCache={childrenFromCache}
          stale={childrenStale}
          lastSyncedAt={childrenLastSyncedAt}
          testID="evolution-offline-notice"
          style={styles.offlineNoticeFullWidth}
        />
        <Text style={styles.stateTitle}>
          {t('evolution.noCheckupsTitle', { name: child.firstName })}
        </Text>
        <Text style={styles.stateText}>{t('evolution.noCheckupsSubtitle')}</Text>
        <Pressable
          style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
          onPress={() =>
            router.push({
              pathname: APP_ROUTES.CAREGIVER.ADD_CHECKUP as never,
              params: { childId: child.id },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('evolution.addCheckup')}
          testID="evolution-add-checkup"
        >
          <Text style={styles.stateButtonText}>{t('evolution.addCheckup')}</Text>
        </Pressable>
      </>,
      'evolution-no-checkups',
    );
  }

  const childrenOffline = Boolean(childrenFromCache && childrenStale);
  const checkupsOffline = Boolean(checkupsFromCache && checkupsStale);
  const curvesOffline = Boolean(curves.fromCache && curves.stale);
  const isOfflineStale = childrenOffline || checkupsOffline || curvesOffline;
  const offlineSyncedAt = checkupsOffline
    ? checkupsLastSyncedAt
    : childrenOffline
      ? childrenLastSyncedAt
      : curvesOffline
        ? curves.lastSyncedAt
        : null;

  const formatTick = (value: number) =>
    activeIndicator.xAxis === 'height'
      ? t('common:units.heightValue', { value })
      : formatAgeShort(value);

  const selectedCheckup =
    (selectedCheckupId ? checkups.find((item) => item.id === selectedCheckupId) : undefined) ??
    latest;
  const chartZoneLabels = {
    upper: t('evolution.zoneLabels.upper'),
    normal: t('evolution.zoneLabels.normal'),
    lower: t('evolution.zoneLabels.lower'),
    outer: t('evolution.zoneLabels.outer'),
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Título de la pantalla */}
        <ScreenHeader
          title={t('evolution.title', { name: child.firstName })}
          showBack={false}
          style={styles.screenHeader}
          testID="evolution-header"
        />

        {/* Banner naranja: datos del niño */}
        <ChildBannerSelector
          style={styles.childBanner}
          children={children}
          activeId={child.id}
          onSelect={(id) => {
            setSelectedChildId(id);
            setSelectedCheckupId(null);
          }}
          subtitle={t('evolution.childSubtitle', {
            age: formatChildAge(child.birthDate),
            birthDate: formatLongDate(child.birthDate),
          })}
          accessibilityLabel={t('privacy.selectChildA11y')}
          testIDPrefix="evolution"
        />

        <OfflineDataNotice
          fromCache={isOfflineStale}
          stale={isOfflineStale}
          lastSyncedAt={offlineSyncedAt}
          testID="evolution-offline-notice"
          style={styles.offlineNotice}
        />

        {/* Selector de Indicadores Antropométricos: P/E, T/E, P/T, IMC/E */}
        <View style={styles.indicatorTabsContainer}>
          {INDICATORS.map((indicator) => {
            const isSelected = indicator.key === selectedIndicator;
            return (
              <Pressable
                key={indicator.key}
                style={[styles.indicatorTab, isSelected && styles.indicatorTabActive]}
                onPress={() => setSelectedIndicator(indicator.key)}
                accessibilityRole="button"
                accessibilityLabel={t(`evolution.indicators.${indicator.key}.name`)}
                testID={`evolution-indicator-${indicator.key}`}
              >
                <Text
                  style={[styles.indicatorTabText, isSelected && styles.indicatorTabTextActive]}
                >
                  {t(`evolution.indicators.${indicator.key}.code`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tarjeta de Gráfica de Crecimiento */}
        <Card style={styles.chartCard} testID="evolution-chart-card">
          {/* Cabecera del gráfico */}
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleWrapper}>
              <Text style={styles.chartTitleText}>
                {t(`evolution.indicators.${activeIndicator.key}.name`)}
              </Text>
              <Text style={styles.chartSubtitleText}>{t('evolution.chartSubtitle')}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.infoIconWrapper, pressed && styles.pressed]}
              onPress={() => setShowChartInfo(true)}
              accessibilityRole="button"
              accessibilityLabel={t('evolution.chartInfo')}
              testID="evolution-chart-info-button"
            >
              <Ionicons name="information-circle-outline" size={26} color={PALETTE.primary} />
            </Pressable>
          </View>

          {/* Curvas de referencia de la OMS con los puntos reales del niño */}
          {curves.status === 'ready' && curves.curves ? (
            <GrowthChart
              curves={curves.curves}
              points={checkupsToPoints(activeIndicator, checkups, child.birthDate)}
              xAxis={activeIndicator.xAxis}
              formatTick={formatTick}
              variant="caregiver"
              zoneLabels={chartZoneLabels}
              selectedCheckupId={selectedCheckup.id}
              onSelectPoint={(point) => {
                const checkupId = point.checkupId ?? null;
                setSelectedCheckupId(checkupId);
                const found = checkups.find((item) => item.id === checkupId);
                if (found) {
                  setModalCheckup(found);
                }
              }}
            />
          ) : curves.status === 'error' ? (
            <View style={styles.chartState} testID="evolution-curves-error">
              {curves.loadError === 'needs-connection' ? (
                <Ionicons name="cloud-offline-outline" size={26} color={PALETTE.primary} />
              ) : null}
              <Text style={styles.stateText}>{curves.error ?? t('evolution.loadError')}</Text>
              {retryButton(() => void curves.load())}
            </View>
          ) : (
            <View style={styles.chartState} testID="evolution-curves-loading">
              <ActivityIndicator color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('evolution.chartLoading')}</Text>
            </View>
          )}

          {/* Leyenda del gráfico */}
          <View style={styles.legendGrid} testID="evolution-chart-legend">
            {/* Fila 1: Niño y Rango esperado OMS */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotChild]} />
                <Text style={styles.legendText}>{child.firstName}</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotOms]} />
                <Text testID="growth-chart-zone-label-normal" style={styles.legendText}>
                  {chartZoneLabels.normal}
                </Text>
              </View>
            </View>

            {/* Fila 2: Línea naranja de referencia */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={styles.legendDashRow}>
                  <View style={styles.legendDash} />
                  <View style={styles.legendDash} />
                </View>
                <Text testID="growth-chart-zone-label-upper" style={styles.legendTextSecondary}>
                  {chartZoneLabels.outer}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.tapPointHint}>{t('evolution.tapPointHint')}</Text>
        </Card>

        {/* Tarjeta Inferior de Último Registro */}
        <Card style={styles.lastRecordCard} testID="evolution-last-record-card">
          <View style={styles.lastRecordHeader}>
            <View style={styles.lastRecordTitleRow}>
              <View style={styles.lastRecordTitleGroup}>
                <Text style={styles.lastRecordTitle}>{t('evolution.lastRecordTitle')}</Text>
                {'localOnly' in latest && latest.localOnly ? (
                  <View style={styles.localOnlyPill} testID="evolution-local-only-badge">
                    <Ionicons name="cloud-upload-outline" size={13} color="#E06A39" />
                    <Text style={styles.localOnlyText}>{t('common:offline.localOnlyBadge')}</Text>
                  </View>
                ) : null}
              </View>
              <CheckupMenuButton
                checkup={latest}
                roleMode="CAREGIVER"
                onDeleted={reloadAfterDelete}
                testID="evolution-last-record-menu"
              />
            </View>
            <Text style={styles.lastRecordDate}>{formatLongDate(latest.measuredAt)}</Text>
          </View>

          <View style={styles.lastRecordDetailsRow}>
            {/* Peso */}
            <View style={styles.recordDetailItem}>
              <Ionicons name="barbell-outline" size={24} color={PALETTE.secondary} />
              <View style={styles.recordDetailText}>
                <Text style={styles.recordDetailLabel}>{t('evolution.weight')}</Text>
                <Text style={styles.recordDetailValue}>
                  {t('common:units.weightValue', {
                    value: formatDecimal(latest.weightKg),
                  })}
                </Text>
              </View>
            </View>

            {/* Talla */}
            <View style={styles.recordDetailItem}>
              <Ionicons name="resize-outline" size={24} color={PALETTE.secondary} />
              <View style={styles.recordDetailText}>
                <Text style={styles.recordDetailLabel}>{t('evolution.height')}</Text>
                <Text style={styles.recordDetailValue}>
                  {t('common:units.heightValue', {
                    value: formatDecimal(latest.lengthHeightCm),
                  })}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.lastRecordDivider} />

          {/* Registró */}
          <View style={styles.recordedByRow}>
            <Ionicons name="person" size={18} color={PALETTE.secondary} />
            <Text style={styles.recordedByText}>
              <Text style={styles.recordedByLabel}>{t('evolution.recordedBy')}</Text>{' '}
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

          {latest.notes ? (
            <View style={styles.notesRow}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={PALETTE.secondary}
                style={styles.notesIcon}
              />
              <View style={styles.notesContent}>
                <Text style={styles.recordedByLabel}>{t('evolution.notes')}</Text>
                <Text style={styles.notesValue}>{latest.notes}</Text>
              </View>
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* Modal explicativo de la gráfica OMS */}
      <Modal
        visible={showChartInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChartInfo(false)}
        testID="evolution-chart-info-modal"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('evolution.infoModal.title')}</Text>

            <View style={styles.modalItem}>
              <View style={[styles.modalDot, styles.legendDotOms]} />
              <View style={styles.modalItemText}>
                <Text style={styles.modalItemTitle}>{t('evolution.infoModal.whoBandTitle')}</Text>
                <Text style={styles.modalItemBody}>{t('evolution.infoModal.whoBand')}</Text>
              </View>
            </View>

            <View style={styles.modalItem}>
              <View style={[styles.modalDot, styles.legendDotChild]} />
              <View style={styles.modalItemText}>
                <Text style={styles.modalItemTitle}>{t('evolution.infoModal.childLineTitle')}</Text>
                <Text style={styles.modalItemBody}>{t('evolution.infoModal.childLine')}</Text>
              </View>
            </View>

            <PrimaryButton
              label={t('evolution.infoModal.close')}
              onPress={() => setShowChartInfo(false)}
              testID="evolution-chart-info-close"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Modal con el detalle del control seleccionado */}
      <Modal
        visible={Boolean(modalCheckup)}
        transparent
        animationType="fade"
        onRequestClose={() => setModalCheckup(null)}
        testID="evolution-checkup-detail-modal"
      >
        {modalCheckup ? (
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setModalCheckup(null)}
              testID="evolution-checkup-modal-backdrop"
              accessibilityRole="button"
              accessibilityLabel={t('evolution.infoModal.close')}
            />
            <View
              style={styles.checkupModalCard}
              testID="evolution-selected-checkup-card"
              accessibilityLabel={t('evolution.selectedRecordTitle')}
            >
              <View style={styles.checkupModalHeader}>
                <View style={styles.checkupModalTitleColumn}>
                  <View style={styles.lastRecordTitleRow}>
                    <Text style={styles.modalTitle}>{t('evolution.selectedRecordTitle')}</Text>
                    {'localOnly' in modalCheckup && modalCheckup.localOnly ? (
                      <View style={styles.localOnlyPill} testID="evolution-modal-local-only-badge">
                        <Ionicons name="cloud-upload-outline" size={13} color="#E06A39" />
                        <Text style={styles.localOnlyText}>
                          {t('common:offline.localOnlyBadge')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.lastRecordDate}>
                    {formatLongDate(modalCheckup.measuredAt)}
                  </Text>
                </View>
                <CheckupMenuButton
                  checkup={modalCheckup}
                  roleMode="CAREGIVER"
                  onDeleted={() => {
                    setModalCheckup(null);
                    reloadAfterDelete();
                  }}
                  testID="evolution-modal-menu"
                />
                <Pressable
                  onPress={() => setModalCheckup(null)}
                  style={({ pressed }) => [styles.closeIconButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('evolution.infoModal.close')}
                  testID="evolution-checkup-modal-close-icon"
                >
                  <Ionicons name="close" size={24} color={PALETTE.text.title} />
                </Pressable>
              </View>

              <View style={styles.lastRecordDetailsRow}>
                <View style={styles.recordDetailItem}>
                  <Ionicons name="barbell-outline" size={24} color={PALETTE.secondary} />
                  <View style={styles.recordDetailText}>
                    <Text style={styles.recordDetailLabel}>{t('evolution.weight')}</Text>
                    <Text style={styles.recordDetailValue}>
                      {t('common:units.weightValue', {
                        value: formatDecimal(modalCheckup.weightKg),
                      })}
                    </Text>
                  </View>
                </View>

                <View style={styles.recordDetailItem}>
                  <Ionicons name="resize-outline" size={24} color={PALETTE.secondary} />
                  <View style={styles.recordDetailText}>
                    <Text style={styles.recordDetailLabel}>{t('evolution.height')}</Text>
                    <Text style={styles.recordDetailValue}>
                      {t('common:units.heightValue', {
                        value: formatDecimal(modalCheckup.lengthHeightCm),
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.lastRecordDivider} />

              <View style={styles.recordedByRow}>
                <Ionicons name="person" size={18} color={PALETTE.secondary} />
                <Text style={styles.recordedByText}>
                  <Text style={styles.recordedByLabel}>{t('evolution.recordedBy')}</Text>{' '}
                  <Text style={styles.recordedByValue}>
                    {formatCheckupRecorder({
                      recorder: modalCheckup.recordedBy,
                      origin: modalCheckup.origin,
                      currentUserId: user?.id,
                      t,
                    })}
                  </Text>
                </Text>
              </View>

              {modalCheckup.notes ? (
                <View style={styles.notesRow}>
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={PALETTE.secondary}
                    style={styles.notesIcon}
                  />
                  <View style={styles.notesContent}>
                    <Text style={styles.recordedByLabel}>{t('evolution.notes')}</Text>
                    <Text style={styles.notesValue}>{modalCheckup.notes}</Text>
                  </View>
                </View>
              ) : null}

              <PrimaryButton
                label={t('evolution.infoModal.close')}
                onPress={() => setModalCheckup(null)}
                testID="evolution-checkup-modal-close"
                style={styles.modalButton}
              />
            </View>
          </View>
        ) : null}
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
    paddingTop: 12,
    paddingBottom: 28,
  },
  screenHeader: {
    marginBottom: 16,
  },
  childBanner: {
    marginBottom: 20,
  },
  offlineNotice: {
    marginBottom: 18,
  },
  offlineNoticeFullWidth: {
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  indicatorTabsContainer: {
    flexDirection: 'row',
    backgroundColor: PALETTE.primary,
    borderRadius: 26,
    padding: 5,
    marginBottom: 22,
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
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
    marginBottom: 22,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chartTitleWrapper: {
    flex: 1,
    alignItems: 'center',
    marginLeft: 26,
  },
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
  infoIconWrapper: {
    padding: 2,
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
  legendItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendDotChild: {
    backgroundColor: PALETTE.secondary,
  },
  legendDotOms: {
    backgroundColor: '#7FA89E',
  },
  legendDashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: 10,
  },
  legendDash: {
    width: 4,
    height: 2,
    backgroundColor: '#D9825B',
    borderRadius: 1,
  },
  legendText: {
    fontFamily: font('medium'),
    fontSize: 12,
    color: PALETTE.text.body,
    fontWeight: '500',
  },
  legendTextSecondary: {
    fontFamily: font('regular'),
    fontSize: 11,
    color: PALETTE.text.muted,
  },
  tapPointHint: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 10,
    textAlign: 'center',
  },
  nonDiagnosticNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: PALETTE.primaryLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  nonDiagnosticNoticeText: {
    flex: 1,
    fontFamily: font('medium'),
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: PALETTE.primary,
  },
  checkupModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: PALETTE.surface,
    borderRadius: RADIUS_PILL,
    padding: 22,
    gap: 16,
    ...CARD_SHADOW,
  },
  checkupModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkupModalTitleColumn: {
    flex: 1,
  },
  closeIconButton: {
    padding: 4,
    marginRight: -4,
    marginTop: -4,
  },
  lastRecordCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  lastRecordHeader: {
    marginBottom: 16,
  },
  lastRecordTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lastRecordTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  localOnlyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2EC',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  localOnlyText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 11,
    color: '#E06A39',
  },
  lastRecordTitle: {
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  lastRecordDate: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  lastRecordDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  recordDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  recordDetailText: {
    flex: 1,
  },
  recordDetailLabel: {
    fontFamily: font('medium'),
    fontSize: 13,
    color: PALETTE.text.muted,
    fontWeight: '500',
  },
  recordDetailValue: {
    fontFamily: font('semibold'),
    fontSize: 22,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  lastRecordDivider: {
    height: 1,
    backgroundColor: PALETTE.border.default,
    marginVertical: 14,
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
    flex: 1,
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
  },
  notesIcon: {
    marginTop: 2,
  },
  notesContent: {
    flex: 1,
    gap: 2,
  },
  notesValue: {
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
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
  modalItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
  },
  modalItemText: {
    flex: 1,
    gap: 2,
  },
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
  modalButton: {
    marginTop: 4,
  },
  chartState: {
    alignItems: 'center',
    gap: 12,
    height: 190,
    justifyContent: 'center',
    marginBottom: 14,
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
});
