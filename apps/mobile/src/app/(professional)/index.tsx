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

export default function AlertsInboxScreen() {
  const { t } = useTranslation('professional');
  const router = useRouter();
  const [filter, setFilter] = useState<AlertStatusFilter>('OPEN');
  const { alerts, childNames, loading, refreshing, error, reload, refresh } = useAlerts(
    ALERT_STATUS_FILTERS[filter],
  );

  // Reload on focus (and whenever the filter changes, since `reload` depends on it).
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
              <Ionicons name="time" size={12} color={PALETTE.feedback.error} />
              <Text style={[styles.tagText, styles.tagSevereText]}>{t('alerts.overdue')}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container} testID="alerts-inbox-screen">
      <View style={styles.chips} accessibilityLabel={t('alerts.filtersA11y')}>
        {FILTER_KEYS.map((key) => {
          const selected = key === filter;
          return (
            <Pressable
              key={key}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`alerts-filter-${key}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {t(`alerts.filters.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {overdueCount > 0 && (
        <View style={styles.overdueBanner} testID="alerts-overdue-summary">
          <Ionicons name="time" size={18} color={PALETTE.feedback.error} />
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
              <Ionicons name="checkmark-circle-outline" size={48} color={PALETTE.text.muted} />
              <Text style={styles.emptyTitle}>{t('alerts.empty')}</Text>
              <Text style={styles.mutedText}>{t('alerts.emptyDescription')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
  },
  chipSelected: { backgroundColor: PALETTE.primary, borderColor: PALETTE.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: PALETTE.text.body },
  chipTextSelected: { color: PALETTE.text.light },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: PALETTE.feedback.errorBg,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
  },
  overdueBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: PALETTE.feedback.error },
  list: { padding: 16, gap: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  pressed: { opacity: 0.8 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childName: { flex: 1, fontSize: 17, fontWeight: '700', color: PALETTE.text.title },
  age: { fontSize: 13, color: PALETTE.text.muted },
  indicator: { fontSize: 14, color: PALETTE.text.body },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: { fontSize: 12, fontWeight: '700' },
  tagRisk: { backgroundColor: PALETTE.secondaryLight },
  tagRiskText: { color: PALETTE.secondaryPressed },
  tagSevere: { backgroundColor: PALETTE.feedback.errorBg },
  tagSevereText: { color: PALETTE.feedback.error },
  tagStatus: { backgroundColor: PALETTE.border.subtle },
  tagStatusText: { color: PALETTE.text.body },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  empty: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: PALETTE.text.title, textAlign: 'center' },
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
