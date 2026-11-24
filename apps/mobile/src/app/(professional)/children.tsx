import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionModal, type ActionModalItem } from '../../components/ActionModal.js';
import { APP_ASSETS } from '../../constants/assets.js';
import { AlertBadge } from '../../components/AlertBadge.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useNotifications } from '../../hooks/useNotifications.js';
import { usePatients } from '../../hooks/usePatients.js';
import { formatChildAge } from '../../lib/children-api.js';
import { groupPatientsByRisk, type PatientListItem } from '../../lib/patients.js';

export default function ProfessionalPatientsScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();
  const { unreadCount, reload: reloadNotifications } = useNotifications();

  const { patients, loading, refreshing, error, reload, refresh } = usePatients();
  const [selectedChild, setSelectedChild] = useState<PatientListItem | null>(null);
  /** Patient whose screen is opening: its card shows a spinner until the tab loses focus. */
  const [openingId, setOpeningId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadNotifications();
      return () => setOpeningId(null);
    }, [reload, reloadNotifications]),
  );

  const sections = useMemo(() => groupPatientsByRisk(patients), [patients]);

  const openPatientActions = (item: PatientListItem) => {
    setSelectedChild(item);
  };

  const closePatientActions = () => {
    setSelectedChild(null);
  };

  /** Closes the menu after choosing an action and marks the card while the next screen loads. */
  const startOpening = () => {
    if (selectedChild) setOpeningId(selectedChild.child.id);
    setSelectedChild(null);
  };

  const modalActions = useMemo<ActionModalItem[]>(() => {
    if (!selectedChild) return [];
    const { child, primaryAlert } = selectedChild;
    const actions: ActionModalItem[] = [
      {
        id: 'evolution',
        label: t('patients.actions.viewEvolution'),
        icon: 'trending-up-outline',
        onPress: () => {
          startOpening();
          router.push({
            pathname: APP_ROUTES.PROFESSIONAL.EVOLUTION as never,
            params: { childId: child.id },
          });
        },
      },
      {
        id: 'history',
        label: t('drawer.checkupHistoryTitle'),
        icon: 'time-outline',
        onPress: () => {
          startOpening();
          router.push({
            pathname: APP_ROUTES.PROFESSIONAL.CHECKUP_HISTORY as never,
            params: { childId: child.id },
          });
        },
      },
      {
        id: 'checkup',
        label: t('patients.actions.registerCheckup'),
        icon: 'add-circle-outline',
        onPress: () => {
          startOpening();
          router.push({
            pathname: APP_ROUTES.PROFESSIONAL.ADD_CHECKUP as never,
            params: { childId: child.id },
          });
        },
      },
      {
        id: 'referral',
        label: t('patients.actions.newReferral'),
        icon: 'share-outline',
        onPress: () => {
          startOpening();
          router.push({
            pathname: APP_ROUTES.PROFESSIONAL.REFERRAL as never,
            params: { childId: child.id },
          });
        },
      },
    ];

    if (primaryAlert) {
      actions.unshift(
        {
          id: 'alert',
          label: t('patients.actions.viewAlert'),
          icon: 'eye-outline',
          onPress: () => {
            startOpening();
            router.push({
              pathname: APP_ROUTES.PROFESSIONAL.ALERT_DETAIL as never,
              params: { alertId: primaryAlert.id },
            });
          },
        },
        {
          id: 'followup',
          label: t('patients.actions.newFollowUp'),
          icon: 'clipboard-outline',
          onPress: () => {
            startOpening();
            router.push({
              pathname: APP_ROUTES.PROFESSIONAL.FOLLOW_UP as never,
              params: { childId: child.id, alertId: primaryAlert.id },
            });
          },
        },
      );
    }

    return actions;
  }, [selectedChild, router, t]);

  const renderBadge = (item: PatientListItem) => {
    const { riskLevel, primaryAlert } = item;
    if (riskLevel === 'SEVERE') {
      return <AlertBadge variant="severe" label={t('patients.status.severe')} />;
    }
    if (riskLevel === 'RISK' && primaryAlert) {
      return <AlertBadge variant="risk" label={t(`alerts.risk.${primaryAlert.riskType}`)} />;
    }
    return <AlertBadge variant="ok" label={t('patients.status.inOrder')} />;
  };

  const renderPatientCard = (item: PatientListItem) => {
    const { child } = item;
    const fullName = `${child.firstName} ${child.lastName}`;
    const ageText = formatChildAge(child.birthDate);

    return (
      <Pressable
        key={child.id}
        style={({ pressed }) => [styles.patientCard, pressed && styles.patientCardPressed]}
        onPress={() => openPatientActions(item)}
        accessibilityRole="button"
        accessibilityLabel={`${fullName}, ${ageText}`}
        testID={`patient-card-${child.id}`}
      >
        <View style={styles.patientInfo}>
          <Text style={styles.childName} numberOfLines={1}>
            {fullName}
          </Text>
          <Text style={styles.childAge}>{ageText}</Text>
        </View>

        <View style={styles.cardRight}>
          {renderBadge(item)}
          {openingId === child.id ? (
            <ActivityIndicator
              size="small"
              color={PALETTE.primary}
              style={styles.chevron}
              accessibilityLabel={t('patients.loading')}
              testID={`patient-card-loading-${child.id}`}
            />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={PALETTE.primary}
              style={styles.chevron}
            />
          )}
        </View>
      </Pressable>
    );
  };

  const renderContent = () => {
    if (loading && !refreshing && patients.length === 0) {
      return (
        <View style={styles.centerContainer} testID="patients-loading-state">
          <ActivityIndicator size="large" color={PALETTE.primary} />
          <Text style={styles.loadingText}>{t('patients.loading')}</Text>
        </View>
      );
    }

    if (error && patients.length === 0) {
      return (
        <View style={styles.centerContainer} testID="patients-error-state">
          <Ionicons name="alert-circle-outline" size={48} color={PALETTE.feedback.error} />
          <Text style={styles.errorText}>{error || t('patients.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.patientCardPressed]}
            onPress={() => void reload()}
            accessibilityRole="button"
            testID="patients-retry-button"
          >
            <Text style={styles.retryButtonText}>{t('patients.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (patients.length === 0) {
      return (
        <View style={styles.emptyContainer} testID="patients-empty-state">
          <Ionicons name="people-outline" size={48} color={PALETTE.primary} />
          <Text style={styles.emptyTitle}>{t('patients.emptyTitle')}</Text>
          <Text style={styles.emptyDescription}>{t('patients.emptyDescription')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.sectionsContainer}>
        {loading && !refreshing ? (
          <View style={styles.refreshingRow} testID="patients-refreshing">
            <ActivityIndicator size="small" color={PALETTE.primary} />
            <Text style={styles.loadingText}>{t('patients.refreshing')}</Text>
          </View>
        ) : null}
        {sections.map((section) => {
          return (
            <View key={section.key} style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
                <View
                  style={[
                    styles.counterBadge,
                    section.key === 'SEVERE' && styles.counterBadgeSevere,
                    section.key === 'RISK' && styles.counterBadgeModerate,
                    section.key === 'NO_ALERTS' && styles.counterBadgeInOrder,
                  ]}
                  testID={`section-counter-${section.key}`}
                >
                  <Text
                    style={[
                      styles.counterBadgeText,
                      section.key === 'SEVERE' && styles.counterBadgeTextSevere,
                      section.key === 'RISK' && styles.counterBadgeTextModerate,
                      section.key === 'NO_ALERTS' && styles.counterBadgeTextInOrder,
                    ]}
                  >
                    {section.count}
                  </Text>
                </View>
              </View>

              {section.data.length > 0 ? (
                <View style={styles.cardsList}>{section.data.map(renderPatientCard)}</View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="patients-screen"
    >
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            <View style={styles.topHeader}>
              <Image
                source={APP_ASSETS.LOGO}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel={t('common:brand.logoLabel')}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.notificationButton,
                  pressed && styles.patientCardPressed,
                ]}
                onPress={() => router.push(APP_ROUTES.PROFESSIONAL.NOTIFICATIONS)}
                accessibilityRole="button"
                accessibilityLabel={t('drawer.notifications')}
                testID="professional-notifications-bell"
              >
                <View style={styles.bellIconWrapper}>
                  <Ionicons name="notifications" size={22} color={PALETTE.secondary} />
                  {unreadCount > 0 ? (
                    <View style={styles.bellDot} testID="professional-bell-dot" />
                  ) : null}
                </View>
              </Pressable>
            </View>

            <View style={styles.titlesBlock}>
              <Text style={styles.mainTitle}>{t('patients.title')}</Text>
              <Text style={styles.subTitle}>{t('patients.subtitle')}</Text>
            </View>

            {renderContent()}
          </>
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            colors={[PALETTE.primary]}
            tintColor={PALETTE.primary}
          />
        }
      />

      <ActionModal
        visible={selectedChild !== null}
        title={
          selectedChild
            ? `${selectedChild.child.firstName} ${selectedChild.child.lastName}`
            : undefined
        }
        subtitle={selectedChild ? formatChildAge(selectedChild.child.birthDate) : undefined}
        actions={modalActions}
        onClose={closePatientActions}
      />
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
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 170,
    height: 48,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  bellIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: PALETTE.secondary,
    borderWidth: 1.5,
    borderColor: PALETTE.surface,
  },
  titlesBlock: {
    marginBottom: 24,
  },
  mainTitle: {
    fontFamily: font('semibold'),
    fontSize: 26,
    fontWeight: '700',
    color: PALETTE.text.title,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subTitle: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.muted,
  },
  sectionsContainer: {
    gap: 24,
  },
  sectionBlock: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.text.title,
    marginRight: 8,
  },
  counterBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBadgeSevere: {
    backgroundColor: '#FDECE7',
  },
  counterBadgeTextSevere: {
    color: PALETTE.feedback.error,
  },
  counterBadgeModerate: {
    backgroundColor: '#FEF2EC',
  },
  counterBadgeTextModerate: {
    color: PALETTE.secondary,
  },
  counterBadgeInOrder: {
    backgroundColor: '#E8F1F0',
  },
  counterBadgeTextInOrder: {
    color: PALETTE.primary,
  },
  counterBadgeText: {
    fontFamily: font('semibold'),
    fontSize: 12,
    fontWeight: '700',
  },
  cardsList: {
    gap: 12,
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...CARD_SHADOW,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  patientCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  patientInfo: {
    flex: 1,
    marginRight: 10,
  },
  childName: {
    fontFamily: font('semibold'),
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.primary,
    marginBottom: 2,
  },
  childAge: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  badgePillSevere: {
    backgroundColor: '#FDECE7',
  },
  badgePillTextSevere: {
    fontFamily: font('medium'),
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.feedback.error,
  },
  badgePillModerate: {
    backgroundColor: '#FEF2EC',
  },
  badgePillTextModerate: {
    fontFamily: font('medium'),
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.secondary,
  },
  badgePillInOrder: {
    backgroundColor: '#E8F1F0',
  },
  badgePillTextInOrder: {
    fontFamily: font('medium'),
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  badgePillText: {},
  chevron: {
    marginLeft: 2,
  },
  centerContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
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
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: PALETTE.primary,
  },
  retryButtonText: {
    fontFamily: font('medium'),
    fontSize: 14,
    color: PALETTE.text.light,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  emptyDescription: {
    marginTop: 8,
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
