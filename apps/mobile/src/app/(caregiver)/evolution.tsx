import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GrowthChart } from '../../components/GrowthChart.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useReferenceCurves } from '../../hooks/useReferenceCurves.js';
import { formatAgeShort, formatDecimal, formatLongDate } from '../../i18n/format.js';
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
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorKey>('PE');

  const {
    status: childrenStatus,
    children,
    error: childrenError,
    load: loadChildren,
  } = useChildren();
  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  const child = children.find((item) => item.id === params.childId) ?? children[0] ?? null;

  const {
    status: checkupsStatus,
    checkups,
    error: checkupsError,
    load: loadCheckups,
  } = useCheckups(child?.id ?? null);

  const activeIndicator =
    INDICATORS.find((item) => item.key === selectedIndicator) ?? INDICATORS[0]!;
  const latest = latestCheckup(checkups);
  const position = curvesPositionFor(activeIndicator, latest);

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
        <Text style={styles.screenTitle}>
          {child ? t('evolution.title', { name: child.firstName }) : t('tabs.evolution')}
        </Text>
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
    return renderState(
      <>
        <Text style={styles.stateText}>{childrenError ?? t('evolution.loadError')}</Text>
        {retryButton(() => void loadChildren())}
      </>,
      'evolution-error',
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
    return renderState(
      <>
        <Text style={styles.stateText}>{checkupsError ?? t('evolution.loadError')}</Text>
        {retryButton(() => void loadCheckups())}
      </>,
      'evolution-error',
    );
  }

  if (!latest) {
    return renderState(
      <>
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

  const formatTick = (value: number) =>
    activeIndicator.xAxis === 'height'
      ? t('common:units.heightValue', { value })
      : formatAgeShort(value);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Título de la pantalla */}
        <Text style={styles.screenTitle}>{t('evolution.title', { name: child.firstName })}</Text>

        {/* Tarjeta Naranja Superior: Datos del niño */}
        <View style={styles.childHeaderCard}>
          <Text style={styles.childNameTitle}>
            {child.firstName} {child.lastName}
          </Text>
          <Text style={styles.childSubtitle}>
            {t('evolution.childSubtitle', {
              age: formatChildAge(child.birthDate),
              birthDate: formatLongDate(child.birthDate),
            })}
          </Text>
        </View>

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
              >
                <Text
                  style={[styles.indicatorTabText, isSelected && styles.indicatorTabTextActive]}
                >
                  {t(`evolution.indicators.${indicator.key}.short`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tarjeta de Gráfica de Crecimiento */}
        <View style={styles.chartCard}>
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
              accessibilityRole="button"
              accessibilityLabel={t('evolution.chartInfo')}
            >
              <Ionicons name="information-circle-outline" size={26} color="#2D5F5A" />
            </Pressable>
          </View>

          {/* Curvas de referencia de la OMS con los puntos reales del niño */}
          {curves.status === 'ready' && curves.curves ? (
            <GrowthChart
              curves={curves.curves}
              points={checkupsToPoints(activeIndicator, checkups, child.birthDate)}
              xAxis={activeIndicator.xAxis}
              formatTick={formatTick}
            />
          ) : curves.status === 'error' ? (
            <View style={styles.chartState} testID="evolution-curves-error">
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
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotChild]} />
              <Text style={styles.legendText}>{child.firstName}</Text>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotOms]} />
              <Text style={styles.legendText}>{t('evolution.legendReference')}</Text>
            </View>
          </View>
        </View>

        {/* Tarjeta Inferior de Último Registro */}
        <View style={styles.lastRecordCard}>
          <Text style={styles.lastRecordTitle}>
            {t('evolution.lastRecord', {
              date: formatLongDate(latest.measuredAt),
            })}
          </Text>

          <View style={styles.lastRecordDetailsRow}>
            {/* Peso */}
            <View style={styles.recordDetailItem}>
              <View style={styles.recordIconBox}>
                <Ionicons name="scale-outline" size={20} color="#C2410C" />
              </View>
              <View>
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
              <View style={styles.recordIconBox}>
                <Ionicons name="resize-outline" size={20} color="#C2410C" />
              </View>
              <View>
                <Text style={styles.recordDetailLabel}>{t('evolution.height')}</Text>
                <Text style={styles.recordDetailValue}>
                  {t('common:units.heightValue', {
                    value: formatDecimal(latest.lengthHeightCm),
                  })}
                </Text>
              </View>
            </View>

            {/* Registró */}
            <View style={styles.recordDetailItem}>
              <View style={styles.recordIconBox}>
                <Ionicons name="person-outline" size={20} color="#C2410C" />
              </View>
              <View>
                <Text style={styles.recordDetailLabel}>{t('evolution.recordedBy')}</Text>
                <Text style={styles.recordDetailValue} numberOfLines={1}>
                  {t(`evolution.origin.${latest.origin}`)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingBottom: 28,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  childHeaderCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 22,
    marginBottom: 20,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  childNameTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
  },
  childSubtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
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
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  indicatorTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  indicatorTabTextActive: {
    color: PALETTE.primary,
  },
  chartCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
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
    fontSize: 17,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  chartSubtitleText: {
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  infoIconWrapper: {
    padding: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendDotChild: {
    backgroundColor: '#F77E4D',
  },
  legendDotOms: {
    backgroundColor: '#7FA89E',
  },
  legendText: {
    fontSize: 12,
    color: PALETTE.text.body,
    fontWeight: '500',
  },
  lastRecordCard: {
    backgroundColor: '#FDC4A8',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#F77E4D',
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#F77E4D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 2,
  },
  lastRecordTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#9A3412',
    textAlign: 'center',
    marginBottom: 14,
  },
  lastRecordDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  recordIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFEADF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDetailLabel: {
    fontSize: 11,
    color: '#9A3412',
    fontWeight: '600',
  },
  recordDetailValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7C2D12',
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
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
