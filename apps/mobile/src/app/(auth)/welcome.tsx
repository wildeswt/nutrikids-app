import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={styles.contentWrapper}>
          {/* Header con Logo y Slogan */}
          <View style={styles.brandHeader}>
            <Image
              source={APP_ASSETS.LOGO}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel={t('common:brand.logoLabel')}
            />
            <Text style={styles.slogan}>{t('common:brand.slogan')}</Text>
            <View style={styles.orangeDivider} />
          </View>

          {/* Sección de acciones */}
          <View style={styles.actionsContainer}>
            <View style={styles.buttonGroup}>
              {/* Botón Principal: Iniciar Sesión */}
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                onPress={() => router.push(APP_ROUTES.AUTH.LOGIN as never)}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.login')}
              >
                <Text style={styles.primaryButtonText}>{t('common:actions.login')}</Text>
              </Pressable>

              {/* Botón Secundario: Registrarse */}
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                onPress={() => router.push(APP_ROUTES.AUTH.SELECT_ROLE as never)}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.register')}
              >
                <Text style={styles.secondaryButtonText}>{t('common:actions.register')}</Text>
              </Pressable>
            </View>

            {/* Selector de idioma (Español / Kichwa) visible antes de iniciar sesión */}
            <View style={styles.languageContainer}>
              <LanguageSelector showHeader={false} />
            </View>
          </View>

          {/* Footer discreto */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t('common:brand.copyright', { year: new Date().getFullYear() })}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandHeader: {
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
    marginBottom: 32,
  },
  logo: {
    width: 320,
    height: 90,
  },
  slogan: {
    fontSize: 17,
    color: PALETTE.text.body,
    fontWeight: '500',
    marginTop: 14,
    textAlign: 'center',
  },
  orangeDivider: {
    width: '90%',
    height: 4,
    backgroundColor: PALETTE.secondary,
    borderRadius: 2,
    marginTop: 20,
  },
  languageContainer: {
    marginTop: 24,
  },
  actionsContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 24,
  },
  buttonGroup: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButtonText: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: PALETTE.surface,
    borderColor: PALETTE.primary,
    borderWidth: 2,
    borderRadius: 28,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: PALETTE.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: PALETTE.text.muted,
  },
});
