import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES } from '@nutrikids/shared';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/auth-context.js';

type DrawerContentProps = Parameters<
  NonNullable<React.ComponentProps<typeof Drawer>['drawerContent']>
>[0];

export function CustomDrawerContent(props: DrawerContentProps) {
  const { t } = useTranslation(['professional', 'common']);
  const { user, switchRole, signOut } = useAuth();
  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  return (
    <View style={styles.drawerContainer}>
      <DrawerContentScrollView contentContainerStyle={styles.drawerScroll}>
        <View style={styles.drawerHeader}>
          <View style={styles.avatar}>
            <Ionicons name="medical" size={28} color="#FFFFFF" />
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
            <Ionicons name="swap-horizontal" size={18} color="#15803D" />
            <Text style={styles.switchButtonText}>{t('drawer.switchToCaregiver')}</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={() => void signOut()}
        >
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={styles.logoutButtonText}>{t('drawer.logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ProfessionalDrawerLayout() {
  const { t } = useTranslation('professional');
  return (
    <Drawer
      defaultStatus="closed"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: '#059669' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
        drawerActiveTintColor: '#059669',
        drawerInactiveTintColor: '#4B5563',
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
        name="profile"
        options={{
          drawerLabel: t('drawer.profile'),
          title: t('drawer.profileTitle'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color as string} />
          ),
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
  },
  drawerScroll: {
    paddingTop: 0,
  },
  drawerHeader: {
    padding: 20,
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
    marginBottom: 10,
    alignItems: 'flex-start',
    gap: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065F46',
  },
  userEmail: {
    fontSize: 13,
    color: '#4B5563',
  },
  specialtyBadge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#A7F3D0',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    textTransform: 'capitalize',
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 16,
    gap: 10,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  switchButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803D',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
