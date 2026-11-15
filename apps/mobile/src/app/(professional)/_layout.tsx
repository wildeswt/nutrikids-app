import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES } from '@nutrikids/shared';
import { Drawer, DrawerContentScrollView, DrawerItemList } from 'expo-router/drawer';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ConnectionBarLayout } from '../../components/ConnectionBar.js';
import { SignOutPendingDialog } from '../../components/SignOutPendingDialog.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useSignOutFlow } from '../../hooks/useSignOutFlow.js';

type DrawerContentProps = Parameters<
  NonNullable<React.ComponentProps<typeof Drawer>['drawerContent']>
>[0];

export function CustomDrawerContent(props: DrawerContentProps) {
  const { t } = useTranslation(['professional', 'common']);
  const { user, switchRole } = useAuth();
  const signOutFlow = useSignOutFlow({
    onGoToPendingSync: () => {
      props.navigation?.closeDrawer?.();
      props.navigation?.navigate?.('pending-sync' as never);
    },
  });
  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  return (
    <View style={styles.drawerContainer}>
      <DrawerContentScrollView contentContainerStyle={styles.drawerScroll}>
        <View style={styles.drawerHeader}>
          <View style={styles.avatar}>
            <Ionicons name="medical" size={28} color={PALETTE.text.light} />
          </View>
          <Text style={styles.userName}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          {user?.specialty && (
            <Text style={styles.specialtyBadge}>
              {t('drawer.specialty', { specialty: t(`common:specialties.${user.specialty}`) })}
            </Text>
          )}
        </View>

        <DrawerItemList {...(props as unknown as React.ComponentProps<typeof DrawerItemList>)} />
      </DrawerContentScrollView>

      <View style={styles.drawerFooter}>
        {hasDualRole && (
          <Pressable
            style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            onPress={() => void switchRole(USER_ROLES.CAREGIVER)}
          >
            <Ionicons name="swap-horizontal" size={18} color={PALETTE.primary} />
            <Text style={styles.switchButtonText}>{t('drawer.switchToCaregiver')}</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={() => void signOutFlow.requestSignOut()}
          disabled={signOutFlow.isSigningOut}
          accessibilityRole="button"
          accessibilityLabel={t('drawer.logout')}
          accessibilityState={{ disabled: signOutFlow.isSigningOut }}
          testID="drawer-logout-button"
        >
          <Ionicons name="log-out-outline" size={18} color={PALETTE.feedback.error} />
          <Text style={styles.logoutButtonText}>{t('drawer.logout')}</Text>
        </Pressable>
      </View>

      <SignOutPendingDialog {...signOutFlow.dialogProps} />
    </View>
  );
}

export default function ProfessionalDrawerLayout() {
  const { t } = useTranslation('professional');
  return (
    <ConnectionBarLayout role={USER_ROLES.PROFESSIONAL}>
      <Drawer
        defaultStatus="closed"
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: PALETTE.primary },
          headerTintColor: PALETTE.text.light,
          headerTitleStyle: { fontFamily: font('semibold'), fontWeight: '600' },
          drawerActiveTintColor: PALETTE.primary,
          drawerInactiveTintColor: PALETTE.text.body,
          drawerStyle: { backgroundColor: PALETTE.background },
        }}
      >
        <Drawer.Screen
          name="index"
          options={{
            drawerLabel: t('drawer.alerts'),
            title: t('drawer.alertsTitle'),
            drawerIcon: ({ color, size }) => (
              <Ionicons name="warning-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Drawer.Screen
          name="alert-detail"
          options={{
            title: t('drawer.alertDetailTitle'),
            // The screen draws its own back button and title.
            headerShown: false,
            // Reachable only by tapping an alert card, so it has no drawer entry.
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="follow-up"
          options={{
            title: t('drawer.followUpTitle'),
            headerShown: false,
            // Reachable only from the alert detail.
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="referral"
          options={{
            title: t('drawer.referralTitle'),
            headerShown: false,
            // Reachable from the alert detail; hidden from the drawer menu.
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="children"
          options={{
            drawerLabel: t('drawer.children'),
            title: t('drawer.childrenTitle'),
            drawerIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Drawer.Screen
          name="messages"
          options={{
            drawerLabel: t('drawer.messages'),
            title: t('drawer.messagesTitle'),
            drawerIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Drawer.Screen
          name="chat-detail"
          options={{
            title: t('drawer.chatTitle'),
            // The screen draws its own back button and title.
            headerShown: false,
            // Reachable only by tapping a conversation, so it has no drawer entry.
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="profile"
          options={{
            drawerLabel: t('drawer.profile'),
            title: t('drawer.profileTitle'),
            drawerIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Drawer.Screen
          name="notifications"
          options={{
            drawerLabel: t('drawer.notifications'),
            title: t('drawer.notificationsTitle'),
            headerShown: false,
            drawerIcon: ({ color, size }) => (
              <Ionicons name="notifications-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Drawer.Screen
          name="pending-sync"
          options={{
            title: t('drawer.pendingSyncTitle'),
            headerShown: false,
            drawerItemStyle: { display: 'none' },
          }}
        />
      </Drawer>
    </ConnectionBarLayout>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  drawerScroll: {
    paddingTop: 0,
  },
  drawerHeader: {
    padding: 20,
    backgroundColor: PALETTE.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border.default,
    marginBottom: 10,
    alignItems: 'flex-start',
    gap: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PALETTE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  userName: {
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  userEmail: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
  },
  specialtyBadge: {
    marginTop: 4,
    fontFamily: font('semibold'),
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.primary,
    backgroundColor: PALETTE.background,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    textTransform: 'capitalize',
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.default,
    padding: 16,
    gap: 10,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.primaryLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS_PILL,
  },
  switchButtonText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.feedback.errorBg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS_PILL,
  },
  logoutButtonText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.feedback.error,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
