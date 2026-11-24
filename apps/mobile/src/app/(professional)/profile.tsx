import { USER_ROLES } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { SignOutPendingDialog } from '../../components/SignOutPendingDialog.js';
import { TwoFactorCard } from '../../components/TwoFactorCard.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_HEIGHT, BUTTON_WIDTH, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useSignOutFlow } from '../../hooks/useSignOutFlow.js';
import { useSyncStatus } from '../../hooks/useSyncStatus.js';

export default function ProfessionalProfileScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();
  const { user, switchRole } = useAuth();
  const syncStatus = useSyncStatus();
  const signOutFlow = useSignOutFlow({
    onGoToPendingSync: () => router.push(APP_ROUTES.PROFESSIONAL.PENDING_SYNC as never),
  });

  const pendingSyncCount = syncStatus.pending + syncStatus.sending;
  const showPendingSyncRow = pendingSyncCount > 0 || syncStatus.error > 0;

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const roleLabel = t('common:roles.PROFESSIONAL');
  const specialtyLabel = user?.specialty
    ? t(`common:specialties.${user.specialty}`, { defaultValue: user.specialty })
    : '';

  const bannerTitle = fullName || roleLabel;

  let bannerSubtitle: string | undefined;
  if (specialtyLabel && user?.licenseNumber) {
    bannerSubtitle = t('profile.bannerSubtitle', {
      specialty: specialtyLabel,
      license: user.licenseNumber,
    });
  } else if (specialtyLabel) {
    bannerSubtitle = specialtyLabel;
  } else if (user?.licenseNumber) {
    bannerSubtitle = `${t('profile.licenseNumber')} ${user.licenseNumber}`;
  } else {
    bannerSubtitle = user?.email;
  }

  const dataRows: [string, string, string?][] = [
    [t('profile.name'), fullName],
    [t('profile.email'), user?.email ?? ''],
    [t('profile.specialty'), specialtyLabel || t('profile.noSpecialty')],
  ];
  if (user?.licenseNumber) {
    dataRows.push([t('profile.licenseNumber'), user.licenseNumber, 'professional-license-row']);
  }

  const renderLink = (key: string, title: string, subtitle: string, onPress: () => void) => (
    <Pressable
      key={key}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={`profile-link-${key}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="professional-profile-screen"
      >
        <ScreenHeader
          title={t('profile.screenTitle')}
          showBack={false}
          style={styles.header}
          testID="profile-header"
        />

        <ChildBanner
          name={bannerTitle}
          subtitle={bannerSubtitle}
          style={styles.banner}
          testID="profile-banner"
        />

        {hasDualRole && (
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            onPress={() => void switchRole(USER_ROLES.CAREGIVER)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.switchToCaregiver')}
            testID="professional-switch-caregiver"
          >
            <Text style={styles.outlineButtonText}>{t('profile.switchToCaregiver')}</Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('profile.account')}</Text>

        <View style={styles.dataCard} testID="professional-my-data-section">
          {dataRows.map(([label, value, testID]) => (
            <View key={label} style={styles.infoRow} testID={testID}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue} selectable>
                {value}
              </Text>
            </View>
          ))}
        </View>
        <View
          style={[styles.dataCard, styles.twoFactorCard]}
          testID="professional-two-factor-section"
        >
          <TwoFactorCard />
        </View>
        {showPendingSyncRow
          ? renderLink(
              'pendingSync',
              t('profile.pendingSync', { count: pendingSyncCount }),
              t('profile.pendingSyncDescription'),
              () => router.push(APP_ROUTES.PROFESSIONAL.PENDING_SYNC as never),
            )
          : null}

        <View style={styles.sectionSpacing}>
          <LanguageSelector />
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
          onPress={() => void signOutFlow.requestSignOut()}
          disabled={signOutFlow.isSigningOut}
          accessibilityRole="button"
          accessibilityLabel={t('profile.logout')}
          accessibilityState={{ disabled: signOutFlow.isSigningOut }}
          testID="professional-logout-button"
        >
          <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
        </Pressable>
      </ScrollView>

      <SignOutPendingDialog {...signOutFlow.dialogProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  scrollContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },
  header: { paddingHorizontal: 0, paddingTop: 0, marginBottom: 6 },
  banner: { marginBottom: 14 },
  sectionTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 20,
    color: PALETTE.text.title,
  },
  sectionSpacing: { marginTop: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 2,
    borderColor: PALETTE.border.input,
    paddingLeft: 22,
    paddingRight: 18,
    paddingVertical: 11,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  rowSubtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  chevron: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 22,
    color: PALETTE.primary,
  },
  outlineButton: {
    borderWidth: 2,
    borderColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    minHeight: BUTTON_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlineButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  dataCard: {
    backgroundColor: PALETTE.input.background,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: PALETTE.border.input,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  twoFactorCard: { paddingVertical: 16 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border.subtle,
  },
  infoLabel: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.text.muted,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
  },
  logoutButton: {
    marginTop: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: BUTTON_WIDTH,
    minHeight: BUTTON_HEIGHT,
    borderWidth: 2,
    borderColor: PALETTE.secondary,
    borderRadius: RADIUS_PILL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.secondary,
  },
  pressed: { opacity: 0.85 },
});
