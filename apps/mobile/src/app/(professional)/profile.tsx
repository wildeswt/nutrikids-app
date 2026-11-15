import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const LOCAL_COLORS = {
  white: '#FFFFFF',
  backdrop: 'rgba(0,0,0,0.45)',
  divider: '#EFEFEF',
} as const;

export default function ProfessionalProfileScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();
  const { user, activeRole, switchRole } = useAuth();
  const syncStatus = useSyncStatus();
  const signOutFlow = useSignOutFlow({
    onGoToPendingSync: () => router.push(APP_ROUTES.PROFESSIONAL.PENDING_SYNC as never),
  });
  const [detailsOpen, setDetailsOpen] = useState(false);

  const pendingSyncCount = syncStatus.pending + syncStatus.sending;
  const showPendingSyncRow = pendingSyncCount > 0 || syncStatus.error > 0;

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const roleLabel = t('common:roles.PROFESSIONAL');
  const specialtyLabel = user?.specialty
    ? t(`common:specialties.${user.specialty}`, { defaultValue: user.specialty })
    : '';

  const bannerTitle = fullName
    ? t('profile.bannerTitle', { name: fullName, role: roleLabel })
    : roleLabel;

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

        <Text style={styles.fieldLabel}>{t('profile.activeRoleLabel')}</Text>
        <View style={styles.activeRow}>
          <Text style={styles.activeRoleText}>
            {activeRole ? t(`common:roles.${activeRole}`) : roleLabel}
          </Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t('profile.activeBadge')}</Text>
          </View>
        </View>

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

        {renderLink('myData', t('profile.myData'), t('profile.myDataDescription'), () =>
          setDetailsOpen(true),
        )}
        {renderLink(
          'children',
          t('profile.linkedChildren'),
          t('profile.linkedChildrenDescription'),
          () => router.push(APP_ROUTES.PROFESSIONAL.CHILDREN as never),
        )}
        {renderLink(
          'notifications',
          t('profile.notifications'),
          t('profile.notificationsDescription'),
          () => router.push(APP_ROUTES.PROFESSIONAL.NOTIFICATIONS as never),
        )}
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

      <Modal
        visible={detailsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="professional-my-data-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.myData')}</Text>
              <Pressable
                onPress={() => setDetailsOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.close', { defaultValue: 'Cerrar' })}
                testID="professional-my-data-close"
              >
                <Ionicons name="close" size={22} color={PALETTE.text.muted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('profile.name')}</Text>
                <Text style={styles.infoValue}>{fullName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('profile.email')}</Text>
                <Text style={styles.infoValue}>{user?.email}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('profile.specialty')}</Text>
                <Text style={styles.infoValue}>{specialtyLabel || t('profile.noSpecialty')}</Text>
              </View>
              {user?.licenseNumber ? (
                <View style={styles.infoRow} testID="professional-license-row">
                  <Text style={styles.infoLabel}>{t('profile.licenseNumber')}</Text>
                  <Text style={styles.infoValue} selectable>
                    {user.licenseNumber}
                  </Text>
                </View>
              ) : null}

              <TwoFactorCard />
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  fieldLabel: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
  },
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
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 2,
    borderColor: PALETTE.border.input,
    paddingLeft: 22,
    paddingRight: 14,
    paddingVertical: 12,
  },
  activeRoleText: {
    flex: 1,
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 16,
    color: PALETTE.text.title,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: LOCAL_COLORS.backdrop,
    justifyContent: 'center',
    padding: SCREEN_MARGIN,
  },
  modalCard: {
    backgroundColor: LOCAL_COLORS.white,
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: LOCAL_COLORS.divider,
  },
  modalTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 18,
    color: PALETTE.text.title,
  },
  modalBody: {
    paddingTop: 14,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border.subtle,
    paddingBottom: 8,
  },
  infoLabel: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.text.muted,
  },
  infoValue: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
  },
  pressed: { opacity: 0.85 },
});
