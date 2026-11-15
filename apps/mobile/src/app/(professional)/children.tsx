import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card } from '../../components/ui/Card.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { usePatients } from '../../hooks/usePatients.js';
import { formatAlertAge } from '../../lib/alert-format.js';
import { formatChildAge } from '../../lib/children-api.js';
import {
  filterPatients,
  paginatePatients,
  type PatientListItem,
  type PatientRiskFilter,
} from '../../lib/patients.js';

const PAGE_SIZE = 20;

const FILTER_KEYS: PatientRiskFilter[] = ['ALL', 'SEVERE', 'RISK', 'NO_ALERTS'];

export default function ProfessionalPatientsScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();

  const [filter, setFilter] = useState<PatientRiskFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { patients, loading, refreshing, error, reload, refresh } = usePatients();

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const filteredPatients = useMemo(
    () => filterPatients(patients, { filter, query: searchQuery }),
    [patients, filter, searchQuery],
  );

  const paginated = useMemo(
    () => paginatePatients(filteredPatients, visibleCount),
    [filteredPatients, visibleCount],
  );

  const countsByLevel = useMemo(() => {
    let severe = 0;
    let risk = 0;
    let noAlerts = 0;
    for (const p of patients) {
      if (p.riskLevel === 'SEVERE') severe += 1;
      else if (p.riskLevel === 'RISK') risk += 1;
      else noAlerts += 1;
    }
    return {
      ALL: patients.length,
      SEVERE: severe,
      RISK: risk,
      NO_ALERTS: noAlerts,
    };
  }, [patients]);

  const handleFilterChange = (newFilter: PatientRiskFilter) => {
    setFilter(newFilter);
    setVisibleCount(PAGE_SIZE);
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    setVisibleCount(PAGE_SIZE);
  };

  const openAlertDetail = (alertId: string) => {
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.ALERT_DETAIL as never,
      params: { alertId },
    });
  };

  const openFollowUp = (childId: string, alertId?: string) => {
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.FOLLOW_UP as never,
      params: { childId, ...(alertId ? { alertId } : {}) },
    });
  };

  const openReferral = (childId: string) => {
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.REFERRAL as never,
      params: { childId },
    });
  };

  const openEvolution = (childId: string) => {
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.EVOLUTION as never,
      params: { childId },
    });
  };

  const openAddCheckup = (childId: string) => {
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.ADD_CHECKUP as never,
      params: { childId },
    });
  };

  const renderPatientCard = ({ item }: { item: PatientListItem }) => {
    const { child, riskLevel, primaryAlert, openAlertCount } = item;
    const fullName = `${child.firstName} ${child.lastName}`;
    const ageText = formatChildAge(child.birthDate);

    const isSevere = riskLevel === 'SEVERE';
    const isRisk = riskLevel === 'RISK';

    return (
      <Card style={styles.patientCard} testID={`patient-card-${child.id}`}>
        <View style={styles.cardHeader}>
          <View style={styles.nameContainer}>
            <Text style={styles.childName} numberOfLines={1}>
              {fullName}
            </Text>
            <Text style={styles.childAge}>{ageText}</Text>
          </View>

          <View style={styles.badgesContainer}>
            <View
              style={[
                styles.riskBadge,
                isSevere && styles.riskBadgeSevere,
                isRisk && styles.riskBadgeRisk,
                riskLevel === 'NO_ALERTS' && styles.riskBadgeNormal,
              ]}
              testID={`patient-risk-badge-${child.id}`}
            >
              <Text
                style={[
                  styles.riskBadgeText,
                  isSevere && styles.riskBadgeTextSevere,
                  isRisk && styles.riskBadgeTextRisk,
                  riskLevel === 'NO_ALERTS' && styles.riskBadgeTextNormal,
                ]}
              >
                {t(`patients.riskLevels.${riskLevel}`)}
              </Text>
            </View>

            {primaryAlert?.isOverdue ? (
              <View
                style={[styles.riskBadge, styles.riskBadgeOverdue]}
                testID={`patient-overdue-badge-${child.id}`}
              >
                <Ionicons name="time" size={12} color={PALETTE.feedback.error} />
                <Text style={[styles.riskBadgeText, styles.riskBadgeTextSevere]}>
                  {t('patients.overdueBadge')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {primaryAlert ? (
          <View style={styles.alertSummaryBox} testID={`patient-alert-summary-${child.id}`}>
            <Ionicons
              name="warning"
              size={15}
              color={isSevere ? PALETTE.feedback.error : PALETTE.secondary}
            />
            <Text style={styles.alertSummaryText} numberOfLines={2}>
              {t('patients.lastAlertLabel', {
                indicator: t(`alerts.indicator.${primaryAlert.indicator}`),
                time: formatAlertAge(primaryAlert.createdAt),
              })}
            </Text>
          </View>
        ) : (
          <View style={styles.noAlertBox}>
            <Ionicons name="checkmark-circle" size={15} color={PALETTE.primary} />
            <Text style={styles.noAlertText}>{t('patients.noOpenAlerts')}</Text>
          </View>
        )}

        <View style={styles.actionsDivider} />

        <View style={styles.actionsRow}>
          {primaryAlert ? (
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={() => openAlertDetail(primaryAlert.id)}
              accessibilityRole="button"
              accessibilityLabel={t('patients.actions.viewAlert')}
              testID={`patient-action-alert-${child.id}`}
            >
              <Ionicons name="eye-outline" size={14} color={PALETTE.primary} />
              <Text style={styles.actionButtonText}>{t('patients.actions.viewAlert')}</Text>
            </Pressable>
          ) : null}

          {primaryAlert ? (
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={() => openFollowUp(child.id, primaryAlert.id)}
              accessibilityRole="button"
              accessibilityLabel={t('patients.actions.newFollowUp')}
              testID={`patient-action-followup-${child.id}`}
            >
              <Ionicons name="clipboard-outline" size={14} color={PALETTE.primary} />
              <Text style={styles.actionButtonText}>{t('patients.actions.newFollowUp')}</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={() => openReferral(child.id)}
            accessibilityRole="button"
            accessibilityLabel={t('patients.actions.newReferral')}
            testID={`patient-action-referral-${child.id}`}
          >
            <Ionicons name="share-outline" size={14} color={PALETTE.primary} />
            <Text style={styles.actionButtonText}>{t('patients.actions.newReferral')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={() => openEvolution(child.id)}
            accessibilityRole="button"
            accessibilityLabel={t('patients.actions.viewEvolution')}
            testID={`patient-action-evolution-${child.id}`}
          >
            <Ionicons name="trending-up-outline" size={14} color={PALETTE.primary} />
            <Text style={styles.actionButtonText}>{t('patients.actions.viewEvolution')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={() => openAddCheckup(child.id)}
            accessibilityRole="button"
            accessibilityLabel={t('patients.actions.registerCheckup')}
            testID={`patient-action-checkup-${child.id}`}
          >
            <Ionicons name="add-circle-outline" size={14} color={PALETTE.primary} />
            <Text style={styles.actionButtonText}>{t('patients.actions.registerCheckup')}</Text>
          </Pressable>
        </View>
      </Card>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.title}>{t('patients.title')}</Text>
      <Text style={styles.subtitle}>{t('patients.subtitle')}</Text>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={PALETTE.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('patients.searchPlaceholder')}
          placeholderTextColor={PALETTE.input.placeholder}
          value={searchQuery}
          onChangeText={handleSearchChange}
          accessibilityLabel={t('patients.searchA11y')}
          returnKeyType="search"
          testID="patients-search-input"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => handleSearchChange('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('patients.clearSearch')}
            testID="patients-search-clear"
          >
            <Ionicons name="close-circle" size={18} color={PALETTE.text.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterBar} accessibilityLabel={t('patients.filterA11y')}>
        {FILTER_KEYS.map((key) => {
          const selected = key === filter;
          const count = countsByLevel[key];
          return (
            <Pressable
              key={key}
              style={[styles.filterChip, selected && styles.filterChipActive]}
              onPress={() => handleFilterChange(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`patient-filter-${key}`}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                {`${t(`patients.filters.${key}`)} (${count})`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!paginated.hasMore) {
      if (paginated.total > PAGE_SIZE) {
        return (
          <View style={styles.paginationFooter}>
            <Text style={styles.paginationSummary}>
              {t('patients.pagination.showing', {
                shown: paginated.items.length,
                total: paginated.total,
              })}
            </Text>
          </View>
        );
      }
      return null;
    }

    return (
      <View style={styles.paginationFooter}>
        <SecondaryButton
          label={t('patients.pagination.loadMore')}
          onPress={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          testID="patients-load-more"
        />
        <Text style={styles.paginationSummary}>
          {t('patients.pagination.showing', {
            shown: paginated.items.length,
            total: paginated.total,
          })}
        </Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;

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
      <View style={styles.emptyContainer} testID="patients-search-empty-state">
        <Ionicons name="search-outline" size={48} color={PALETTE.text.muted} />
        <Text style={styles.emptyTitle}>{t('patients.emptySearchTitle')}</Text>
        <Text style={styles.emptyDescription}>{t('patients.emptySearchDescription')}</Text>
        <Pressable
          style={styles.clearSearchButton}
          onPress={() => {
            setSearchQuery('');
            setFilter('ALL');
          }}
          accessibilityRole="button"
          testID="patients-empty-clear"
        >
          <Text style={styles.clearSearchButtonText}>{t('patients.clearSearch')}</Text>
        </Pressable>
      </View>
    );
  };

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
          style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          onPress={() => void reload()}
          accessibilityRole="button"
          testID="patients-retry-button"
        >
          <Text style={styles.retryButtonText}>{t('patients.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="patients-screen">
      <FlatList
        data={paginated.items}
        keyExtractor={(item) => item.child.id}
        renderItem={renderPatientCard}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  listContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 16,
    paddingBottom: 32,
  },
  headerContainer: {
    marginBottom: 16,
  },
  title: {
    fontFamily: font('semibold'),
    fontSize: 22,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.input.background,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 16,
    height: 44,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.title,
    paddingVertical: 0,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
  },
  filterChipActive: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  filterChipText: {
    fontFamily: font('medium'),
    fontSize: 12,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  filterChipTextActive: {
    color: PALETTE.text.light,
  },
  patientCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    ...CARD_SHADOW,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  nameContainer: {
    flex: 1,
  },
  childName: {
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 2,
  },
  childAge: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
  },
  riskBadgeSevere: {
    backgroundColor: PALETTE.feedback.errorBg,
  },
  riskBadgeRisk: {
    backgroundColor: PALETTE.feedback.warningBg,
  },
  riskBadgeNormal: {
    backgroundColor: PALETTE.primaryLight,
  },
  riskBadgeOverdue: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
  },
  riskBadgeText: {
    fontFamily: font('semibold'),
    fontSize: 11,
    fontWeight: '600',
  },
  riskBadgeTextSevere: {
    color: PALETTE.feedback.error,
  },
  riskBadgeTextRisk: {
    color: PALETTE.feedback.warning,
  },
  riskBadgeTextNormal: {
    color: PALETTE.primary,
  },
  alertSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: PALETTE.border.subtle,
  },
  alertSummaryText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.body,
    lineHeight: 16,
  },
  noAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  noAlertText: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  actionsDivider: {
    height: 1,
    backgroundColor: PALETTE.border.subtle,
    marginVertical: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.primaryLight,
  },
  actionButtonPressed: {
    opacity: 0.75,
  },
  actionButtonText: {
    fontFamily: font('medium'),
    fontSize: 12,
    fontWeight: '500',
    color: PALETTE.primary,
  },
  paginationFooter: {
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  paginationSummary: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: PALETTE.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SCREEN_MARGIN,
    gap: 12,
  },
  loadingText: {
    fontFamily: font('medium'),
    fontSize: 14,
    color: PALETTE.text.muted,
  },
  errorText: {
    fontFamily: font('medium'),
    fontSize: 14,
    color: PALETTE.text.title,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  retryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  retryButtonText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.light,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  emptyDescription: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  clearSearchButton: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.primaryLight,
  },
  clearSearchButtonText: {
    fontFamily: font('medium'),
    fontSize: 13,
    color: PALETTE.primary,
  },
});
