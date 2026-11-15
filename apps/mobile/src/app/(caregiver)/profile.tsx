import { USER_ROLES } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { ConsentChildItem } from '../../components/ConsentChildItem.js';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { SignOutPendingDialog } from '../../components/SignOutPendingDialog.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_HEIGHT, BUTTON_WIDTH, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useSignOutFlow } from '../../hooks/useSignOutFlow.js';
import { useSyncStatus } from '../../hooks/useSyncStatus.js';

export { ConsentChildItem };

export default function CaregiverProfileScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const { user, activeRole, switchRole } = useAuth();
  const syncStatus = useSyncStatus();
  const signOutFlow = useSignOutFlow({
    onGoToPendingSync: () => router.push(APP_ROUTES.CAREGIVER.PENDING_SYNC as never),
  });

  const pendingSyncCount = syncStatus.pending + syncStatus.sending;
  const showPendingSyncRow = pendingSyncCount > 0 || syncStatus.error > 0;

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const roleLabel = t('common:roles.CAREGIVER');

  // Mismas filas que el diseño de Figma. Los permisos de los niños se gestionan en «Privacidad».
  const accountLinks = [
    ['myData', 'profile.myData', 'profile.myDataDescription', APP_ROUTES.CAREGIVER.MY_DATA],
    [
      'consents',
      'profile.consentsTitle',
      'profile.consentsRowDescription',
      APP_ROUTES.CAREGIVER.PRIVACY,
    ],
    ['privacy', 'profile.privacy', 'profile.privacyDescription', APP_ROUTES.CAREGIVER.PRIVACY],
  ] as const;

  const renderLink = (key: string, title: string, subtitle: string, route: string) => (
    <Pressable
      key={key}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => router.push(route as never)}
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
        testID="caregiver-profile-screen"
      >
        <ScreenHeader
          title={t('profile.title')}
          showBack={false}
          style={styles.header}
          testID="profile-header"
        />

        <ChildBanner
          name={fullName ? t('myData.bannerTitle', { name: fullName, role: roleLabel }) : roleLabel}
          subtitle={user?.email}
          style={styles.banner}
          testID="profile-banner"
        />

        <Text style={styles.fieldLabel}>{t('profile.activeRole')}</Text>
        <View style={styles.activeRow}>
          <Text style={styles.activeRoleText}>
            {activeRole ? t(`common:roles.${activeRole}`) : '-'}
          </Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t('profile.activeBadge')}</Text>
          </View>
        </View>

        {hasDualRole && (
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            onPress={() => void switchRole(USER_ROLES.PROFESSIONAL)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.switchToProfessional')}
          >
            <Text style={styles.outlineButtonText}>{t('profile.switchToProfessional')}</Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('profile.account')}</Text>
        {accountLinks.map(([key, title, subtitle, route]) =>
          renderLink(key, t(title), t(subtitle), route),
        )}
        {showPendingSyncRow
          ? renderLink(
              'pendingSync',
              t('profile.pendingSync', { count: pendingSyncCount }),
              t('profile.pendingSyncDescription'),
              APP_ROUTES.CAREGIVER.PENDING_SYNC,
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
          testID="caregiver-logout-button"
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
  pressed: { opacity: 0.85 },
});
