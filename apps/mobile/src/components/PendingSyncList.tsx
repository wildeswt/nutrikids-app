import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import { useConnection } from '../context/connection-context.js';
import { usePendingSyncItems, type PendingSyncItem } from '../hooks/usePendingSyncItems.js';
import { formatDecimal, formatMediumDate } from '../i18n/format.js';
import type { SyncQueueStatus } from '../lib/local-db/index.js';
import { Card } from './ui/Card.js';
import { ConfirmDialog } from './ui/ConfirmDialog.js';
import { PrimaryButton } from './ui/PrimaryButton.js';
import { ScreenHeader } from './ui/ScreenHeader.js';

type StatusLabelKey =
  | 'pendingSync.status.local'
  | 'pendingSync.status.sending'
  | 'pendingSync.status.error'
  | 'pendingSync.status.sent';

interface StatusStyle {
  labelKey: StatusLabelKey;
  backgroundColor: string;
  textColor: string;
}

const STATUS_STYLES: Record<SyncQueueStatus, StatusStyle> = {
  LOCAL: {
    labelKey: 'pendingSync.status.local',
    backgroundColor: PALETTE.secondaryLight,
    textColor: PALETTE.secondaryPressed,
  },
  SENDING: {
    labelKey: 'pendingSync.status.sending',
    backgroundColor: PALETTE.primaryLight,
    textColor: PALETTE.primary,
  },
  ERROR: {
    labelKey: 'pendingSync.status.error',
    backgroundColor: PALETTE.feedback.errorBg,
    textColor: PALETTE.feedback.error,
  },
  SENT: {
    labelKey: 'pendingSync.status.sent',
    backgroundColor: PALETTE.feedback.successBg,
    textColor: PALETTE.feedback.success,
  },
};

export interface PendingSyncListProps {
  /** Ruta de respaldo cuando el historial de navegación no permite `router.back()`. */
  fallbackRoute: string;
}

function getDiscardKeys(item: PendingSyncItem) {
  if (item.kind === 'follow-up') {
    return {
      titleKey: 'pendingSync.discardFollowUpTitle' as const,
      messageKey: 'pendingSync.discardFollowUpMessage' as const,
    };
  }
  if (item.kind === 'feeding') {
    return {
      titleKey: 'pendingSync.discardFeedingTitle' as const,
      messageKey: 'pendingSync.discardFeedingMessage' as const,
    };
  }
  return {
    titleKey: 'pendingSync.discardConfirmTitle' as const,
    messageKey: 'pendingSync.discardConfirmMessage' as const,
  };
}

type CaregiverT = ReturnType<typeof useTranslation<['caregiver', 'common']>>['t'];

function formatSummaryLines(
  item: PendingSyncItem,
  t: CaregiverT,
): { primary: string; secondary: string | null } {
  if (item.kind === 'follow-up') {
    return {
      primary: t('pendingSync.followUpSummary', { count: item.itemCount }),
      secondary: item.nextCheckupDate
        ? t('pendingSync.followUpNextCheckup', { date: formatMediumDate(item.nextCheckupDate) })
        : null,
    };
  }

  if (item.kind === 'feeding') {
    return {
      primary: t('pendingSync.feedingSummary', {
        date: formatMediumDate(item.logDate),
        count: item.mealsPerDay,
      }),
      secondary: null,
    };
  }

  return {
    primary: t('pendingSync.recordSummary', {
      date: formatMediumDate(item.measuredAt),
      weight: formatDecimal(item.weightKg, 1),
      height: formatDecimal(item.lengthHeightCm, 1),
    }),
    secondary: null,
  };
}

/**
 * Vista compartida de elementos pendientes de sincronización (controles, seguimientos clínicos
 * y registros de alimentación) reutilizada por cuidador y profesional.
 */
export function PendingSyncList({ fallbackRoute }: PendingSyncListProps) {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const { isOnline } = useConnection();
  const { items, loading, pendingCount, isSyncing, retryItem, discardItem, syncNow } =
    usePendingSyncItems();

  const [discardTarget, setDiscardTarget] = useState<PendingSyncItem | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackRoute as never);
  };

  const confirmDiscard = (item: PendingSyncItem) => setDiscardTarget(item);

  const discardKeys = discardTarget ? getDiscardKeys(discardTarget) : null;

  const offlineBannerText =
    pendingCount > 0
      ? t('pendingSync.offlineBanner', { count: pendingCount })
      : t('pendingSync.offlineBannerZero');

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right', 'bottom']}
      testID="pending-sync-screen"
    >
      <View style={styles.contentWrapper}>
        <ScreenHeader
          title={t('pendingSync.title')}
          backLabel={t('pendingSync.back')}
          onBack={handleBack}
          style={styles.header}
          testID="pending-sync-header"
        />

        {!isOnline ? (
          <View style={styles.offlineBanner} testID="pending-sync-offline-banner">
            <Ionicons name="cloud-offline-outline" size={16} color={PALETTE.text.light} />
            <Text style={styles.offlineBannerText}>{offlineBannerText}</Text>
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centerState} testID="pending-sync-loading">
              <ActivityIndicator color={PALETTE.primary} />
              <Text style={styles.emptySubtitle}>{t('pendingSync.loading')}</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centerState} testID="pending-sync-empty">
              <Ionicons name="checkmark-circle-outline" size={40} color={PALETTE.primary} />
              <Text style={styles.emptyTitle}>{t('pendingSync.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('pendingSync.emptySubtitle')}</Text>
            </View>
          ) : (
            <View style={styles.cardsList}>
              {items.map((item) => {
                const badge = STATUS_STYLES[item.status];
                const summary = formatSummaryLines(item, t);

                return (
                  <Card
                    key={item.id}
                    style={styles.itemCard}
                    testID={`pending-sync-card-${item.id}`}
                  >
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.childName} numberOfLines={1}>
                        {item.childName}
                      </Text>
                      <View
                        style={[styles.statusBadge, { backgroundColor: badge.backgroundColor }]}
                        testID={`pending-sync-status-${item.id}`}
                      >
                        <Text style={[styles.statusBadgeText, { color: badge.textColor }]}>
                          {t(badge.labelKey)}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.recordSummary}>{summary.primary}</Text>
                    {summary.secondary ? (
                      <Text style={styles.recordMeta}>{summary.secondary}</Text>
                    ) : null}

                    {item.status === 'ERROR' ? (
                      <>
                        <Text style={styles.errorText} testID={`pending-sync-error-${item.id}`}>
                          {item.lastError || t('pendingSync.errorFallback')}
                        </Text>
                        <View style={styles.errorActionsRow}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.actionLink,
                              pressed && styles.actionPressed,
                            ]}
                            onPress={() => {
                              void retryItem(item.id);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('pendingSync.retry')} ${item.childName}`}
                            testID={`pending-sync-retry-${item.id}`}
                          >
                            <Ionicons name="refresh-outline" size={16} color={PALETTE.primary} />
                            <Text style={styles.retryText}>{t('pendingSync.retry')}</Text>
                          </Pressable>

                          <Pressable
                            style={({ pressed }) => [
                              styles.actionLink,
                              pressed && styles.actionPressed,
                            ]}
                            onPress={() => confirmDiscard(item)}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('pendingSync.discard')} ${item.childName}`}
                            testID={`pending-sync-discard-${item.id}`}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color={PALETTE.feedback.error}
                            />
                            <Text style={styles.discardText}>{t('pendingSync.discard')}</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label={isSyncing ? t('pendingSync.syncing') : t('pendingSync.syncNow')}
            onPress={() => {
              void syncNow();
            }}
            disabled={!isOnline || isSyncing}
            loading={isSyncing}
            testID="pending-sync-sync-now"
          />
        </View>
      </View>
      <ConfirmDialog
        visible={discardTarget !== null}
        tone="danger"
        icon="trash-outline"
        title={discardKeys ? t(discardKeys.titleKey) : ''}
        message={discardKeys ? t(discardKeys.messageKey) : ''}
        confirmLabel={t('pendingSync.discardConfirmAction')}
        cancelLabel={t('pendingSync.discardCancelAction')}
        onConfirm={() => {
          const target = discardTarget;
          setDiscardTarget(null);
          if (target) void discardItem(target.id);
        }}
        onCancel={() => setDiscardTarget(null)}
        testID="pending-sync-discard-dialog"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 14,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#575757',
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  offlineBannerText: {
    fontFamily: font('medium'),
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.text.light,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  cardsList: {
    gap: 14,
  },
  itemCard: {
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  childName: {
    flex: 1,
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontFamily: font('semibold'),
    fontSize: 11,
    fontWeight: '600',
  },
  recordSummary: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
  },
  recordMeta: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 13,
    lineHeight: 18,
    color: PALETTE.feedback.error,
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  actionPressed: {
    opacity: 0.7,
  },
  retryText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  discardText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.feedback.error,
  },
  footer: {
    paddingTop: 12,
  },
});
