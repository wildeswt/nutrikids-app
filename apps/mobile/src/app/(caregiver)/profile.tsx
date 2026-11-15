import { USER_ROLES, type ChildResponse } from '@nutrikids/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { ConsentChildItem } from '../../components/ConsentChildItem.js';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { SignOutPendingDialog } from '../../components/SignOutPendingDialog.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useSignOutFlow } from '../../hooks/useSignOutFlow.js';
import { useSyncStatus } from '../../hooks/useSyncStatus.js';
import { fetchCaregiverChildren } from '../../lib/consent-api.js';

export { ConsentChildItem };

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function CaregiverProfileScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const { user, activeRole, switchRole } = useAuth();
  const syncStatus = useSyncStatus();
  const signOutFlow = useSignOutFlow({
    onGoToPendingSync: () => router.push(APP_ROUTES.CAREGIVER.PENDING_SYNC as never),
  });
  const [children, setChildren] = useState<ChildResponse[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);

  const pendingSyncCount = syncStatus.pending + syncStatus.sending;
  const showPendingSyncRow = pendingSyncCount > 0 || syncStatus.error > 0;

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  useEffect(() => {
    let isMounted = true;
    async function loadChildren() {
      try {
        const list = await fetchCaregiverChildren();
        if (isMounted) setChildren(list);
      } catch {
        // En caso de que falle (ej. offline temporal), se mantiene lista vacía
      } finally {
        if (isMounted) setLoadingChildren(false);
      }
    }
    void loadChildren();
    return () => {
      isMounted = false;
    };
  }, []);

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  const accountLinks = [
    ['myData', APP_ROUTES.CAREGIVER.MY_DATA, 'person-outline'],
    ['privacy', APP_ROUTES.CAREGIVER.PRIVACY, 'shield-checkmark-outline'],
  ] as const satisfies ReadonlyArray<readonly [string, string, IconName]>;

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
          name={fullName || '-'}
          subtitle={user?.email}
          style={styles.banner}
          testID="profile-banner"
        />

        <Text style={styles.fieldLabel}>{t('profile.activeRole')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitleBody}>
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
        {accountLinks.map(([key, route, icon]) => (
          <Pressable
            key={key}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(route as never)}
            accessibilityRole="button"
            accessibilityLabel={t(`profile.${key}`)}
            testID={`profile-link-${key}`}
          >
            <Ionicons name={icon} size={22} color={PALETTE.primary} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t(`profile.${key}`)}</Text>
              <Text style={styles.rowSubtitle}>{t(`profile.${key}Description`)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={PALETTE.primary} />
          </Pressable>
        ))}
        {showPendingSyncRow ? (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(APP_ROUTES.CAREGIVER.PENDING_SYNC as never)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.pendingSync', { count: pendingSyncCount })}
            testID="profile-link-pendingSync"
          >
            <Ionicons name="cloud-upload-outline" size={22} color={PALETTE.primary} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>
                {t('profile.pendingSync', { count: pendingSyncCount })}
              </Text>
              <Text style={styles.rowSubtitle}>{t('profile.pendingSyncDescription')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={PALETTE.primary} />
          </Pressable>
        ) : null}

        {/* Sección de consentimientos informados por niño (Criterios NK-20) */}
        <View testID="consents-section">
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>
            {t('profile.consentsTitle')}
          </Text>
          <Text style={styles.sectionDescription}>{t('profile.consentsDescription')}</Text>

          {loadingChildren ? (
            <ActivityIndicator size="small" color={PALETTE.primary} style={styles.loader} />
          ) : children.length > 0 ? (
            <View style={styles.consentList}>
              {children.map((child) => (
                <ConsentChildItem key={child.id} child={child} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t('profile.noChildren')}</Text>
            </View>
          )}
        </View>

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
  sectionDescription: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    marginTop: 4,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 2,
    borderColor: PALETTE.border.input,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  rowTitleBody: {
    flex: 1,
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 16,
    color: PALETTE.text.title,
  },
  rowSubtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
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
    paddingVertical: 13,
    alignItems: 'center',
  },
  outlineButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  consentList: { gap: 10 },
  loader: { marginVertical: 12 },
  emptyBox: {
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 2,
    borderColor: PALETTE.border.input,
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  logoutButton: {
    marginTop: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 318,
    borderWidth: 2,
    borderColor: PALETTE.secondary,
    borderRadius: RADIUS_PILL,
    paddingVertical: 13,
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
