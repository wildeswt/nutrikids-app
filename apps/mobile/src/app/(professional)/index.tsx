import { Ionicons } from '@expo/vector-icons';
import type { AlertResponse } from '@nutrikids/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAlerts } from '../../hooks/useAlerts.js';
import { formatAlertAge } from '../../lib/alert-format.js';
import { ALERT_STATUS_FILTERS, type AlertStatusFilter } from '../../lib/alerts-api.js';

const FILTER_KEYS = Object.keys(ALERT_STATUS_FILTERS) as AlertStatusFilter[];

// Colores específicos del diseño que no están en PALETTE (sin modificar colors.ts).
const SCREEN_SURFACE = '#FBFBFB';
const SEVERE_COLOR = '#E14100';

export default function AlertsInboxScreen() {
  const { t } = useTranslation('professional');
  const router = useRouter();
  const [filter, setFilter] = useState<AlertStatusFilter>('OPEN');
  const { alerts, childNames, loading, refreshing, error, reload, refresh } = useAlerts(
    ALERT_STATUS_FILTERS[filter],
  );

  // Recarga al enfocar la pantalla (y al cambiar el filtro, ya que `reload` depende de él).
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const overdueCount = alerts.filter((a) => a.isOverdue).length;

  const openAlert = (alertId: string) =>
    router.push({ pathname: APP_ROUTES.PROFESSIONAL.ALERT_DETAIL as never, params: { alertId } });

  const renderItem = ({ item }: { item: AlertResponse }) => {
    const child = childNames[item.childId] ?? t('alerts.unknownChild');
    const indicator = t(`alerts.indicator.${item.indicator}`);
    const risk = t(`alerts.risk.${item.riskType}`);

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => openAlert(item.id)}
        accessibilityRole="button"
        accessibilityLabel={t('alerts.openA11y', { child, indicator, risk })}
        testID={`alert-card-${item.id}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.childName} numberOfLines={1}>
            {child}
          </Text>
          <Text style={styles.age}>{formatAlertAge(item.createdAt)}</Text>
        </View>
        <Text style={styles.indicator}>{indicator}</Text>
        <View style={styles.tags}>
          <View style={[styles.tag, item.isSevere ? styles.tagSevere : styles.tagRisk]}>
            <Text
              style={[styles.tagText, item.isSevere ? styles.tagSevereText : styles.tagRiskText]}
            >
              {item.isSevere ? `${risk} · ${t('alerts.severe')}` : risk}
            </Text>
          </View>
          <View style={[styles.tag, styles.tagStatus]}>
            <Text style={[styles.tagText, styles.tagStatusText]}>
              {t(`alerts.status.${item.status}`)}
            </Text>
          </View>
          {item.isOverdue && (
            <View style={[styles.tag, styles.tagSevere]} testID={`alert-overdue-${item.id}`}>
              <Ionicons name="time" size={12} color={SEVERE_COLOR} />
              <Text style={[styles.tagText, styles.tagSevereText]}>{t('alerts.overdue')}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container} testID="alerts-inbox-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('alerts.title')}</Text>
        <Text style={styles.subtitle}>{t('alerts.subtitle')}</Text>
      </View>

      <View style={styles.filterBar} accessibilityLabel={t('alerts.filtersA11y')}>
        {FILTER_KEYS.map((key) => {
          const selected = key === filter;
          return (
            <Pressable
              key={key}
              style={[styles.filterSegment, selected && styles.filterSegmentActive]}
              onPress={() => setFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`alerts-filter-${key}`}
            >
              <Text style={[styles.filterSegmentText, selected && styles.filterSegmentTextActive]}>
                {t(`alerts.filters.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {overdueCount > 0 && (
        <View style={styles.overdueBanner} testID="alerts-overdue-summary">
          <Ionicons name="time" size={20} color={SEVERE_COLOR} />
          <Text style={styles.overdueBannerText}>
            {t('alerts.overdueSummary', { count: overdueCount })}
          </Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.center} testID="alerts-loading">
          <ActivityIndicator size="large" color={PALETTE.primary} />
          <Text style={styles.mutedText}>{t('alerts.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.center} testID="alerts-error">
          <Ionicons name="alert-circle" size={48} color={PALETTE.feedback.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={() => void reload()}
            accessibilityRole="button"
            testID="alerts-retry"
          >
            <Text style={styles.retryText}>{t('alerts.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={alerts.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              colors={[PALETTE.primary]}
              tintColor={PALETTE.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty} testID="alerts-empty">
              <View style={styles.emptyIconCircle}>
                <Ionicons name="checkmark-circle-outline" size={44} color={PALETTE.text.muted} />
              </View>
              <Text style={styles.emptyTitle}>{t('alerts.empty')}</Text>
              <Text style={styles.emptyDescription}>{t('alerts.emptyDescription')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_SURFACE },
  header: {
    paddingHorizontal: 30,
    paddingTop: 24,
    gap: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: PALETTE.text.muted,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    marginHorizontal: 30,
    marginTop: 22,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 25,
    backgroundColor: PALETTE.primary,
  },
  filterSegment: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSegmentActive: {
    backgroundColor: SCREEN_SURFACE,
  },
  filterSegmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: SCREEN_SURFACE,
    textAlign: 'center',
  },
  filterSegmentTextActive: {
    color: PALETTE.primary,
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 30,
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 25,
    backgroundColor: PALETTE.feedback.errorBg,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
  },
  overdueBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: SEVERE_COLOR,
  },
  list: {
    paddingHorizontal: 30,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 14,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: SCREEN_SURFACE,
    borderRadius: 25,
    padding: 16,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  pressed: { opacity: 0.8 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  age: {
    fontSize: 12,
    fontWeight: '400',
    color: PALETTE.text.muted,
  },
  indicator: {
    fontSize: 14,
    fontWeight: '400',
    color: PALETTE.text.body,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 25,
  },
  tagText: { fontSize: 11, fontWeight: '600' },
  tagRisk: { backgroundColor: PALETTE.secondaryLight },
  tagRiskText: { color: PALETTE.secondaryPressed },
  tagSevere: { backgroundColor: PALETTE.feedback.errorBg },
  tagSevereText: { color: SEVERE_COLOR },
  tagStatus: { backgroundColor: PALETTE.border.subtle },
  tagStatusText: { color: PALETTE.text.body },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  empty: { alignItems: 'center', gap: 8 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PALETTE.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: PALETTE.text.muted,
    textAlign: 'center',
    maxWidth: 280,
  },
  mutedText: { fontSize: 14, color: PALETTE.text.muted, textAlign: 'center' },
  errorText: { fontSize: 15, color: PALETTE.feedback.error, textAlign: 'center' },
  retryButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  retryText: { color: PALETTE.text.light, fontSize: 15, fontWeight: '600' },
});
