import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AUTH_STATUS } from '../constants/routes.js';
import { AuthProvider, useAuth } from '../context/auth-context.js';
import { ConnectionProvider } from '../context/connection-context.js';
import '../i18n/index.js';
import { restoreLanguagePreference } from '../i18n/language.js';
import { usePushNavigation } from '../hooks/usePushNavigation.js';
import { resolveGuardRedirect } from '../lib/navigation-guard.js';
import { syncEngine } from '../lib/sync/index.js';

export function NavigationGuard() {
  const { status, activeRole } = useAuth();
  usePushNavigation();
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

function SyncLifecycle() {
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === AUTH_STATUS.AUTHENTICATED && user?.id) {
      void syncEngine.start(user.id);
      return () => {
        syncEngine.stop();
      };
    }

    if (status === AUTH_STATUS.UNAUTHENTICATED) {
      syncEngine.stop();
    }

    return undefined;
  }, [status, user?.id]);

  return null;
}

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Wait for the language saved in the app (Español / Kichwa) before showing any screen, so a
  // user who picked Kichwa on a Spanish phone never sees a flash of Spanish.
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    void restoreLanguagePreference().finally(() => setIsLanguageReady(true));
  }, []);

  const isAppReady = isLanguageReady && (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (isAppReady) {
      // Si la carga de fuentes falla, continua con la fuente del sistema sin bloquear la app.
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isAppReady]);

  if (!isAppReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ConnectionProvider>
          <AuthProvider>
            <SyncLifecycle />
            <NavigationGuard />
          </AuthProvider>
        </ConnectionProvider>
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
