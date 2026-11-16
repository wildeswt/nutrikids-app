import { Ionicons } from '@expo/vector-icons';
import type { CaregiverCheckupResponse } from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckupMenuButton } from '../../components/CheckupMenuButton.js';
import { ChildBanner } from '../../components/ChildBanner.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useOptionalAuth } from '../../context/auth-context.js';
import { useActiveChildId } from '../../hooks/useActiveChild.js';
import { useCheckups, useProfessionalCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatDecimal, formatLongDate } from '../../i18n/format.js';
import { formatCheckupRecorder } from '../../lib/checkup-recorder.js';
import { formatChildAge } from '../../lib/children-api.js';

type OriginFilter = 'ALL' | 'PROFESSIONAL' | 'CAREGIVER';

const FILTER_OPTIONS: OriginFilter[] = ['ALL', 'PROFESSIONAL', 'CAREGIVER'];

export default function CheckupHistoryScreen({
  roleMode = 'CAREGIVER',
}: { roleMode?: 'CAREGIVER' | 'PROFESSIONAL' } = {}) {
  const { t } = useTranslation(['caregiver', 'common', 'professional']);
  const router = useRouter();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const isProfessional =
    roleMode === 'PROFESSIONAL' || Boolean(user?.roles?.includes('PROFESSIONAL'));

  const [originFilter, setOriginFilter] = useState<OriginFilter>('ALL');

  const params = useLocalSearchParams<{ childId?: string }>();
  const activeCaregiverChildId = useActiveChildId();
  const { children, status: childrenStatus, load: loadChildren } = useChildren();

  const childId = useMemo(() => {
    if (params.childId) return params.childId;
    if (isProfessional) return null;
    return activeCaregiverChildId ?? children[0]?.id ?? null;
  }, [params.childId, isProfessional, activeCaregiverChildId, children]);

  const activeChild = useMemo(
    () => children.find((c) => c.id === childId) ?? null,
    [children, childId],
  );

  const caregiverCheckupsHook = useCheckups(isProfessional ? null : childId);
  const professionalCheckupsHook = useProfessionalCheckups(isProfessional ? childId : null);

  const checkupsState = isProfessional ? professionalCheckupsHook : caregiverCheckupsHook;
  const { status, checkups, error, load } = checkupsState;

  // Recarga cada vez que vuelve a mostrarse (por ejemplo, al regresar de corregir un control).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filteredCheckups = useMemo(() => {
    const list = checkups as CaregiverCheckupResponse[];
    if (originFilter === 'ALL') return list;
    return list.filter((item) => item.origin === originFilter);
  }, [checkups, originFilter]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(
        (isProfessional ? APP_ROUTES.PROFESSIONAL.CHILDREN : APP_ROUTES.CAREGIVER.HOME) as never,
      );
    }
  };

  const handleRegisterNew = () => {
    if (isProfessional) {
      router.push({
        pathname: APP_ROUTES.PROFESSIONAL.ADD_CHECKUP as never,
        params: childId ? { childId } : {},
      });
    } else {
      router.push({
        pathname: APP_ROUTES.CAREGIVER.ADD_CHECKUP as never,
        params: childId ? { childId } : {},
      });
    }
  };

  const renderItem = ({ item }: { item: CaregiverCheckupResponse }) => {
    const isStanding = item.position === 'STANDING';
    const positionText = isStanding
      ? t('checkupHistory.positionStanding')
      : t('checkupHistory.positionRecumbent');
    const recordedByText = formatCheckupRecorder({
      recorder: item.recordedBy,
      origin: item.origin,
      currentUserId: user?.id,
      t,
    });
    const isProOrigin = item.origin === 'PROFESSIONAL';

    return (
      <View style={styles.card} testID={`checkup-item-${item.id}`}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardMeasurements}>
            {`${formatDecimal(item.weightKg)} kg · ${formatDecimal(item.lengthHeightCm)} cm`}
          </Text>
          <CheckupMenuButton
            checkup={item}
            roleMode={isProfessional ? 'PROFESSIONAL' : 'CAREGIVER'}
            returnTo="checkup-history"
            onDeleted={() => void load()}
            testID={`checkup-history-menu-${item.id}`}
          />
        </View>

        <Text style={styles.cardDate}>{formatLongDate(item.measuredAt)}</Text>

        <Text style={styles.recorderText}>
          {t('checkupHistory.recordedBy', { name: recordedByText })}
        </Text>

        <View style={styles.tagsRow}>
          <View style={[styles.tag, isProOrigin ? styles.tagPro : styles.tagCaregiver]}>
            <Text
              style={[styles.tagText, isProOrigin ? styles.tagProText : styles.tagCaregiverText]}
            >
              {t(`checkupHistory.origin.${item.origin}`)}
            </Text>
          </View>

          <View style={[styles.tag, styles.tagPosition]}>
            <Text style={[styles.tagText, styles.tagPositionText]}>{positionText}</Text>
          </View>

          {!item.isCurrent ? (
            <View style={[styles.tag, styles.tagCorrected]}>
              <Text style={[styles.tagText, styles.tagCorrectedText]}>
                {t('checkupHistory.corrected')}
              </Text>
            </View>
          ) : null}
        </View>

        {item.notes ? <Text style={styles.notesText}>{item.notes}</Text> : null}
      </View>
    );
  };

  const renderEmptyFilter = () => (
    <View style={styles.stateContainer} testID="checkup-history-empty-filter">
      <View style={styles.emptyIconCircle}>
        <Ionicons name="filter-outline" size={32} color={PALETTE.text.muted} />
      </View>
      <Text style={styles.emptyTitle}>{t('checkupHistory.emptyFilterTitle')}</Text>
      <Text style={styles.emptySubtitle}>{t('checkupHistory.emptyFilterSubtitle')}</Text>
    </View>
  );

  const renderContent = () => {
    if (status === 'loading' || childrenStatus === 'loading') {
      return (
        <View style={styles.stateContainer} testID="checkup-history-loading">
          <ActivityIndicator size="large" color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('checkupHistory.loading')}</Text>
        </View>
      );
    }
    if (status === 'error') {
      return (
        <View style={styles.stateContainer} testID="checkup-history-error">
          <Ionicons name="alert-circle-outline" size={48} color={PALETTE.feedback.error} />
          <Text style={styles.errorText}>{error || t('checkupHistory.loadError')}</Text>
          <PrimaryButton
            label={t('checkupHistory.retry')}
            onPress={() => void load()}
            testID="checkup-history-retry"
          />
        </View>
      );
    }

    if (checkups.length === 0) {
      return (
        <View style={styles.stateContainer} testID="checkup-history-empty">
          <View style={styles.emptyIconCircle}>
            <Ionicons name="clipboard-outline" size={36} color={PALETTE.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('checkupHistory.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('checkupHistory.emptySubtitle')}</Text>
          <View style={styles.emptyButtonWrap}>
            <PrimaryButton
              label={t('checkupHistory.register')}
              onPress={handleRegisterNew}
              testID="checkup-history-register-empty"
            />
          </View>
        </View>
      );
    }

    const isRefreshing = (status as string) === 'loading';

    return (
      <FlatList
        data={filteredCheckups}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyFilter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void load();
              void loadChildren();
            }}
            colors={[PALETTE.primary]}
            tintColor={PALETTE.primary}
          />
        }
        ListFooterComponent={
          <View style={styles.footerCta}>
            <PrimaryButton
              label={t('checkupHistory.register')}
              onPress={handleRegisterNew}
              testID="checkup-history-register-footer"
            />
          </View>
        }
      />
    );
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right', 'bottom']}
      testID="checkup-history-screen"
    >
      <View style={styles.header}>
        <ScreenHeader
          title={t('checkupHistory.title')}
          onBack={handleBack}
          backLabel={t('common:actions.back')}
          testID="checkup-history-header"
        />

        <Text style={styles.subtitle}>
          {status === 'loading'
            ? t('checkupHistory.subtitleLoading')
            : t('checkupHistory.subtitle', { count: checkups.length })}
        </Text>

        {activeChild ? (
          <ChildBanner
            name={`${activeChild.firstName} ${activeChild.lastName}`}
            subtitle={`${formatChildAge(activeChild.birthDate)} · ${formatLongDate(activeChild.birthDate)}`}
            style={styles.banner}
          />
        ) : null}

        {checkups.length > 0 ? (
          <View style={styles.filterPillContainer} testID="checkup-history-filters">
            {FILTER_OPTIONS.map((option) => {
              const selected = originFilter === option;
              const label =
                option === 'ALL'
                  ? t('checkupHistory.filters.ALL', { count: checkups.length })
                  : t(`checkupHistory.filters.${option}`);
              return (
                <Pressable
                  key={option}
                  style={[styles.filterTab, selected && styles.filterTabActive]}
                  onPress={() => setOriginFilter(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`checkup-filter-${option}`}
                >
                  <Text style={[styles.filterTabText, selected && styles.filterTabTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.body}>{renderContent()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  header: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 8,
  },
  subtitle: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.muted,
    marginTop: 2,
    marginBottom: 16,
  },
  banner: {
    marginBottom: 16,
  },
  filterPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.primary,
    paddingVertical: 5,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  filterTab: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: RADIUS_PILL,
  },
  filterTabActive: {
    backgroundColor: PALETTE.surface,
  },
  filterTabText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.surface,
    textAlign: 'center',
  },
  filterTabTextActive: {
    color: PALETTE.primary,
  },
  body: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardMeasurements: {
    flex: 1,
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 17,
    color: PALETTE.primary,
  },
  cardDate: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  recorderText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
  },
  tagText: {
    fontFamily: font('semibold'),
    fontSize: 11,
    fontWeight: '600',
  },
  tagPro: {
    backgroundColor: PALETTE.primaryLight,
  },
  tagProText: {
    color: PALETTE.primary,
  },
  tagCaregiver: {
    backgroundColor: PALETTE.secondaryLight,
  },
  tagCaregiverText: {
    color: PALETTE.secondaryPressed,
  },
  tagPosition: {
    backgroundColor: PALETTE.border.subtle,
  },
  tagPositionText: {
    color: PALETTE.text.body,
  },
  tagCorrected: {
    backgroundColor: PALETTE.feedback.warningBg,
  },
  tagCorrectedText: {
    color: PALETTE.feedback.warning,
  },
  notesText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
    marginTop: 4,
  },
  footerCta: {
    marginTop: 12,
    alignItems: 'center',
  },
  stateContainer: {
    flex: 1,
    paddingHorizontal: SCREEN_MARGIN,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: PALETTE.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: font('semibold'),
    fontSize: 17,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  emptyButtonWrap: {
    width: '100%',
    marginTop: 8,
  },
});
