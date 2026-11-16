import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES } from '@nutrikids/shared';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ConnectionBarLayout } from '../../components/ConnectionBar.js';
import { PALETTE } from '../../constants/colors.js';

export default function CaregiverTabsLayout() {
  const { t } = useTranslation('caregiver');
  return (
    <ConnectionBarLayout role={USER_ROLES.CAREGIVER}>
      <Tabs
        // «Atrás» (botón del teléfono o router.back) vuelve a la pantalla anterior, no a Inicio.
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
          name="feeding"
          options={{
            title: t('tabs.feeding'),
            headerTitle: t('tabs.feedingHeader'),
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
          name="reminders"
          options={{
            title: t('tabs.reminders'),
            headerTitle: t('tabs.remindersHeader'),
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="add-reminder"
          options={{
            title: t('tabs.addReminder'),
            headerTitle: t('tabs.addReminderHeader'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="learn"
          options={{
            title: t('tabs.learn'),
            headerTitle: t('tabs.learnHeader'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="learn-article"
          options={{
            title: t('tabs.learnArticle'),
            headerTitle: t('tabs.learnArticleHeader'),
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
          name="link-professional"
          options={{
            title: t('tabs.linkProfessional'),
            headerTitle: t('tabs.linkProfessionalHeader'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="child-registered"
          options={{
            title: t('tabs.childRegistered'),
            headerTitle: t('tabs.childRegisteredHeader'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="child-professionals"
          options={{
            title: t('tabs.childProfessionals'),
            headerTitle: t('tabs.childProfessionalsHeader'),
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
        <Tabs.Screen
          name="my-children"
          options={{
            title: t('tabs.myChildren'),
            headerTitle: t('tabs.myChildrenHeader'),
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="feeding-history"
          options={{
            title: t('tabs.feedingHistory'),
            headerTitle: t('tabs.feedingHistoryHeader'),
            headerShown: false,
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="checkup-history"
          options={{
            title: t('tabs.checkupHistory'),
            headerTitle: t('tabs.checkupHistoryHeader'),
            headerShown: false,
            tabBarStyle: { display: 'none' },
            tabBarItemStyle: { display: 'none' },
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="pending-sync"
          options={{
            title: t('tabs.pendingSync'),
            headerTitle: t('tabs.pendingSyncHeader'),
            headerShown: false,
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
