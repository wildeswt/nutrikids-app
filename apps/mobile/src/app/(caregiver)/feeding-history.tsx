import { Ionicons } from '@expo/vector-icons';
import type { FeedingLogResponse } from '@nutrikids/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_HEIGHT, BUTTON_WIDTH, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatLongDate } from '../../i18n/format.js';
import { fetchChildFeedingLogs } from '../../lib/feeding-api.js';
import { toLocalIsoDate } from '../../lib/feeding-form.js';
import { daysBetween, parseFeedingDetails } from '../../lib/feeding-history.js';

const HISTORY_DAYS = 30;

type LoadState = 'loading' | 'ready' | 'error';

export default function FeedingHistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver']);
  const params = useLocalSearchParams<{ childId?: string }>();
  const { status: childrenStatus, children, load: loadChildren } = useChildren();
  const child = children.find((c) => c.id === params.childId) ?? children[0] ?? null;

  const [state, setState] = useState<LoadState>('loading');
  const [logs, setLogs] = useState<FeedingLogResponse[]>([]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  const loadLogs = useCallback(async () => {
    if (!child) return;
    setState('loading');
    const from = new Date();
    from.setDate(from.getDate() - (HISTORY_DAYS - 1));
    try {
      setLogs(await fetchChildFeedingLogs(child.id, { from: toLocalIsoDate(from) }));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [child]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.CAREGIVER.FEEDING);
  };

  const dayLabel = (logDate: string) => {
    const [y, m, d] = logDate.split('-').map(Number);
    const date = formatLongDate(new Date(y!, m! - 1, d!));
    const diff = daysBetween(toLocalIsoDate(), logDate);
    if (diff === 0) return t('feedingHistory.today', { date });
    if (diff === 1) return t('feedingHistory.yesterday', { date });
    return date;
  };

  const renderBody = () => {
    if (!child || state === 'loading' || childrenStatus === 'idle') {
      return (
        <View style={styles.stateBox} testID="feeding-history-loading">
          <ActivityIndicator color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('feedingHistory.loading')}</Text>
        </View>
      );
    }
    if (state === 'error') {
      return (
        <View style={styles.stateBox} testID="feeding-history-error">
          <Text style={styles.stateText}>{t('feedingHistory.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() => void loadLogs()}
            accessibilityRole="button"
            accessibilityLabel={t('feedingHistory.retry')}
            testID="feeding-history-retry"
          >
            <Text style={styles.stateButtonText}>{t('feedingHistory.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    if (logs.length === 0) {
      return (
        <View style={styles.stateBox} testID="feeding-history-empty">
          <Text style={styles.stateTitle}>{t('feedingHistory.emptyTitle')}</Text>
          <Text style={styles.stateText}>{t('feedingHistory.emptySubtitle')}</Text>
        </View>
      );
    }
    return logs.map((log) => {
      const { meals, text } = parseFeedingDetails(log.details);
      return (
        <View key={log.id} style={styles.card} testID={`feeding-history-item-${log.id}`}>
          <View style={styles.cardTop}>
            <Text style={styles.cardDate}>{dayLabel(log.logDate)}</Text>
            {log.mealsPerDay !== null ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {t('feedingHistory.mealsCount', { count: log.mealsPerDay })}
                </Text>
              </View>
            ) : null}
          </View>
          {meals.length > 0 ? (
            <Text style={styles.cardMeals}>
              {meals.map((id) => t(`feeding.meals.${id}`)).join(' · ')}
            </Text>
          ) : null}
          {text ? <Text style={styles.cardText}>{text}</Text> : null}
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="caregiver-feeding-history-screen"
      >
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('feeding.back')}
          testID="feeding-history-back"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('feeding.back')}</Text>
        </Pressable>

        <Text style={styles.screenTitle} accessibilityRole="header">
          {t('feedingHistory.title')}
        </Text>

        {child ? (
          <ChildBanner
            name={`${child.firstName} ${child.lastName}`}
            subtitle={
              state === 'ready'
                ? t('feedingHistory.subtitle', { days: HISTORY_DAYS, count: logs.length })
                : t('feedingHistory.subtitleLoading', { days: HISTORY_DAYS })
            }
            style={styles.banner}
            testID="feeding-history-banner"
          />
        ) : null}

        <View style={styles.list}>{renderBody()}</View>

        <Pressable
          style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
          onPress={() =>
            router.push({
              pathname: APP_ROUTES.CAREGIVER.FEEDING as never,
              params: child ? { childId: child.id } : {},
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('feedingHistory.register')}
          testID="feeding-history-register"
        >
          <Text style={styles.submitButtonText}>{t('feedingHistory.register')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  scrollContent: { paddingHorizontal: SCREEN_MARGIN, paddingTop: 12, paddingBottom: 36 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backText: {
    fontFamily: font('medium'),
    fontSize: 20,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  screenTitle: {
    fontFamily: font('semibold'),
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 18,
  },
  banner: { marginBottom: 24 },
  list: { gap: 12 },
  card: {
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 2,
    borderColor: PALETTE.border.input,
    paddingLeft: 22,
    paddingRight: 18,
    paddingVertical: 14,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate: {
    flex: 1,
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  chip: {
    backgroundColor: PALETTE.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.text.light,
  },
  cardMeals: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  cardText: { fontFamily: font('regular'), fontSize: 14, color: PALETTE.text.body },
  stateBox: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  stateTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 18,
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
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: { color: PALETTE.text.light, fontSize: 15, fontWeight: '700' },
  submitButton: {
    marginTop: 28,
    width: '100%',
    maxWidth: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    alignSelf: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonPressed: { backgroundColor: PALETTE.primaryPressed },
  submitButtonText: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: { opacity: 0.8 },
});
