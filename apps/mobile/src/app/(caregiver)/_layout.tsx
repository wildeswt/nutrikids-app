import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PALETTE } from '../../constants/colors.js';

export default function CaregiverTabsLayout() {
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
          title: 'Inicio',
          headerTitle: 'Mis Niños',
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
          title: 'Evolución',
          headerTitle: 'Evolución y Curvas OMS',
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
          title: 'Control',
          headerTitle: 'Registrar Control',
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
          href: null,
          title: 'Control Guardado',
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensajes',
          headerTitle: 'Mensajes y Recordatorios',
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
          href: null,
          title: 'Chat',
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          headerTitle: 'Mi Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={size + 4}
              color={color as string}
            />
          ),
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
