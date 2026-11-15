import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES } from '@nutrikids/shared';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ConnectionBarLayout } from '../../components/ConnectionBar.js';
import { PALETTE } from '../../constants/colors.js';

export default function ProfessionalTabsLayout() {
  const { t } = useTranslation('professional');

  return (
    <ConnectionBarLayout role={USER_ROLES.PROFESSIONAL}>
      <Tabs
        // «Atrás» (botón del teléfono o router.back) vuelve a la pantalla anterior, no a la primera.
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: PALETTE.primary,
          tabBarInactiveTintColor: PALETTE.text.title,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabBarItem,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('drawer.alertsTitle'),
            tabBarLabel: t('drawer.alerts'),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'warning' : 'warning-outline'}
                size={size + 2}
                color={color as string}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="children"
          options={{
            title: t('drawer.childrenTitle'),
            tabBarLabel: t('drawer.children'),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'people' : 'people-outline'}
                size={size + 2}
                color={color as string}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="add-checkup"
          options={{
            title: t('drawer.addCheckupTitle'),
            tabBarLabel: () => null,
            tabBarStyle: { display: 'none' },
            tabBarIcon: () => (
              <View style={styles.centerButtonContainer}>
                <View style={styles.centerButton}>
                  <Ionicons name="add" size={32} color="#FFFFFF" />
                </View>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: t('drawer.messagesTitle'),
            tabBarLabel: t('drawer.messages'),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'}
                size={size + 2}
                color={color as string}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('drawer.profileTitle'),
            tabBarLabel: t('drawer.profile'),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'person-circle' : 'person-circle-outline'}
                size={size + 4}
                color={color as string}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="notifications"
          options={{
            title: t('drawer.notificationsTitle'),
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="alert-detail"
          options={{
            title: t('drawer.alertDetailTitle'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="follow-up"
          options={{
            title: t('drawer.followUpTitle'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="referral"
          options={{
            title: t('drawer.referralTitle'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="evolution"
          options={{
            title: t('drawer.evolutionTitle'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="checkup-history"
          options={{
            title: t('drawer.checkupHistoryTitle'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="chat-detail"
          options={{
            title: t('drawer.chatTitle'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="pending-sync"
          options={{
            title: t('drawer.pendingSyncTitle'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
      </Tabs>
    </ConnectionBarLayout>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 70,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: PALETTE.surface,
    borderTopColor: PALETTE.border.default,
    borderTopWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  tabBarItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  centerButtonContainer: {
    top: -16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: PALETTE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
});
