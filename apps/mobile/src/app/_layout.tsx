import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AUTH_STATUS } from '../constants/routes.js';
import { AuthProvider, useAuth } from '../context/auth-context.js';
import { resolveGuardRedirect } from '../lib/navigation-guard.js';

export function NavigationGuard() {
  const { status, activeRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const currentGroup = segments[0];
  const redirectTarget = resolveGuardRedirect({ status, activeRole, currentGroup });

  useEffect(() => {
    if (redirectTarget) {
      router.replace(redirectTarget as never);
    }
  }, [redirectTarget, router]);

  if (status === AUTH_STATUS.LOADING) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  // Prevent flash of wrong screen by rendering Redirect synchronously before mounting
  if (redirectTarget) {
    return <Redirect href={redirectTarget as never} />;
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
