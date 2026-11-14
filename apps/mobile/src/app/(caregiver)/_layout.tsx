import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { PALETTE } from '../../constants/colors.js';

export default function CaregiverTabsLayout() {
  const { t } = useTranslation('caregiver');
  return (
    <Tabs
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
          title: t('tabs.home'),
          headerTitle: t('tabs.homeHeader'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size + 2}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="evolution"
        options={{
          title: t('tabs.evolution'),
          headerTitle: t('tabs.evolutionHeader'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'trending-up' : 'trending-up-outline'}
              size={size + 2}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="add-checkup"
        options={{
          title: t('tabs.addCheckup'),
          headerTitle: t('tabs.addCheckupHeader'),
          tabBarStyle: { display: 'none' },
          tabBarLabel: () => null,
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
        name="checkup-saved"
        options={{
          title: t('tabs.checkupSaved'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          headerTitle: t('tabs.messagesHeader'),
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
        name="chat-detail"
        options={{
          title: t('tabs.chat'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          headerTitle: t('tabs.profileHeader'),
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
        name="consent"
        options={{
          title: t('tabs.consent'),
          headerTitle: t('tabs.consentHeader'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="add-child"
        options={{
          title: t('tabs.addChild'),
          headerTitle: t('tabs.addChildHeader'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('tabs.notifications'),
          headerTitle: t('tabs.notificationsHeader'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="my-data"
        options={{
          title: t('tabs.myData'),
          headerTitle: t('tabs.myDataHeader'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="edit-child"
        options={{
          title: t('tabs.editChild'),
          headerTitle: t('tabs.editChildHeader'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="privacy"
        options={{
          title: t('tabs.privacy'),
          headerTitle: t('tabs.privacyHeader'),
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
    </Tabs>
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
