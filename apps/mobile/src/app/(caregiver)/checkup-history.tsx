import { Ionicons } from '@expo/vector-icons';
import type { CaregiverCheckupResponse } from '@nutrikids/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
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
import { ChildBanner } from '../../components/ChildBanner.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useOptionalAuth } from '../../context/auth-context.js';
import { useActiveChildId } from '../../hooks/useActiveChild.js';
import { useCheckups, useProfessionalCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatCheckupRecorder } from '../../lib/checkup-recorder.js';
import { formatChildAge } from '../../lib/children-api.js';

export default function CheckupHistoryScreen({
  roleMode = 'CAREGIVER',
}: { roleMode?: 'CAREGIVER' | 'PROFESSIONAL' } = {}) {
  const { t } = useTranslation(['caregiver', 'common', 'professional']);
  const router = useRouter();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const isProfessional =
    roleMode === 'PROFESSIONAL' || Boolean(user?.roles?.includes('PROFESSIONAL'));

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

    return (
      <View style={styles.card} testID={`checkup-item-${item.id}`}>
        <View style={styles.cardHeader}>
          <View style={styles.dateBlock}>
            <Ionicons name="calendar-outline" size={16} color={PALETTE.primary} />
            <Text style={styles.cardDate}>{formatLongDate(item.measuredAt)}</Text>
          </View>
          <View style={styles.positionBadge}>
            <Text style={styles.positionText}>{positionText}</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>{t('checkupHistory.weightLabel')}</Text>
            <Text style={styles.metricValue}>
              {item.weightKg.toFixed(1)} <Text style={styles.metricUnit}>kg</Text>
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>{t('checkupHistory.heightLabel')}</Text>
            <Text style={styles.metricValue}>
              {item.lengthHeightCm.toFixed(1)} <Text style={styles.metricUnit}>cm</Text>
            </Text>
          </View>
        </View>

        <View style={styles.recorderRow}>
          <Ionicons name="person-circle-outline" size={15} color={PALETTE.text.muted} />
          <Text style={styles.recorderText} numberOfLines={1}>
            {recordedByText}
          </Text>
        </View>

        {item.notes ? (
          <View style={styles.notesBox}>
            <Ionicons
              name="document-text-outline"
              size={14}
              color={PALETTE.text.muted}
              style={styles.notesIcon}
            />
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        ) : null}
      </View>
    );
  };

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
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            onPress={() => void load()}
            accessibilityRole="button"
            testID="checkup-history-retry"
          >
            <Text style={styles.primaryButtonText}>{t('checkupHistory.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (checkups.length === 0) {
      return (
        <View style={styles.stateContainer} testID="checkup-history-empty">
          <Ionicons name="clipboard-outline" size={48} color={PALETTE.primary} />
          <Text style={styles.emptyTitle}>{t('checkupHistory.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('checkupHistory.emptySubtitle')}</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            onPress={handleRegisterNew}
            accessibilityRole="button"
            testID="checkup-history-register-empty"
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{t('checkupHistory.register')}</Text>
          </Pressable>
        </View>
      );
    }

    const isRefreshing = (status as string) === 'loading';

    return (
      <FlatList
        data={checkups as CaregiverCheckupResponse[]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.buttonPressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
          testID="checkup-history-back"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('common:actions.back')}</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>{t('checkupHistory.title')}</Text>
          {checkups.length > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.addBadgeButton, pressed && styles.buttonPressed]}
              onPress={handleRegisterNew}
              accessibilityRole="button"
              accessibilityLabel={t('checkupHistory.register')}
              testID="checkup-history-add-top"
            >
              <Ionicons name="add" size={16} color={PALETTE.primary} />
              <Text style={styles.addBadgeText}>Nuevo</Text>
            </Pressable>
          ) : null}
        </View>

        {activeChild ? (
          <ChildBanner
            name={`${activeChild.firstName} ${activeChild.lastName}`}
            subtitle={`${formatChildAge(activeChild.birthDate)} · ${formatLongDate(activeChild.birthDate)}`}
            style={styles.banner}
          />
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
    paddingTop: 8,
    paddingBottom: 12,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  backText: {
    fontFamily: font('medium'),
    fontSize: 16,
    color: PALETTE.text.title,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontFamily: font('semibold'),
    fontSize: 24,
    fontWeight: '700',
    color: PALETTE.text.title,
    letterSpacing: -0.3,
  },
  addBadgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PALETTE.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS_PILL,
  },
  addBadgeText: {
    fontFamily: font('semibold'),
    fontSize: 13,
    color: PALETTE.primary,
  },
  banner: {
    marginBottom: 4,
  },
  body: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    ...CARD_SHADOW,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardDate: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  positionBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
  },
  positionText: {
    fontFamily: font('medium'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.background,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    marginBottom: 2,
  },
  metricValue: {
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  metricUnit: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  recorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recorderText: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: PALETTE.secondary,
  },
  notesIcon: {
    marginRight: 6,
    marginTop: 1,
  },
  notesText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.body,
    lineHeight: 16,
  },
  stateContainer: {
    flex: 1,
    paddingHorizontal: SCREEN_MARGIN,
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    marginTop: 12,
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
  },
  errorText: {
    marginTop: 12,
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: RADIUS_PILL,
    ...CARD_SHADOW,
  },
  primaryButtonText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    color: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
