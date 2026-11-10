import { USER_ROLES } from '@nutrikids/shared';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { APP_ROUTES, AUTH_STATUS } from '../constants/routes.js';
import { AuthProvider, useAuth } from '../context/auth-context.js';

function NavigationGuard() {
  const { status, activeRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === AUTH_STATUS.LOADING) {
      return;
    }

    const currentGroup = segments[0];
    const inAuthGroup = currentGroup === APP_ROUTES.AUTH.GROUP;
    const inCaregiverGroup = currentGroup === APP_ROUTES.CAREGIVER.GROUP;
    const inProfessionalGroup = currentGroup === APP_ROUTES.PROFESSIONAL.GROUP;

    if (status === AUTH_STATUS.UNAUTHENTICATED) {
      if (!inAuthGroup) {
        router.replace(APP_ROUTES.AUTH.LOGIN);
      }
    } else if (status === AUTH_STATUS.AUTHENTICATED) {
      if (activeRole === USER_ROLES.CAREGIVER && !inCaregiverGroup) {
        router.replace(APP_ROUTES.CAREGIVER.ROOT);
      } else if (activeRole === USER_ROLES.PROFESSIONAL && !inProfessionalGroup) {
        router.replace(APP_ROUTES.PROFESSIONAL.ROOT);
      }
    }
  }, [status, activeRole, segments, router]);

  if (status === AUTH_STATUS.LOADING) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(caregiver)" />
      <Stack.Screen name="(professional)" />
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <NavigationGuard />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
  },
});
