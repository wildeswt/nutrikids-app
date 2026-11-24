import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader, authStyles } from '../../components/auth/AuthBrandHeader.js';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);

  return (
    <SafeAreaView style={authStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrapper}>
          <AuthBrandHeader style={styles.brandHeader} />

          {/* Sección de acciones */}
          <View style={styles.actionsContainer}>
            <View style={styles.buttonGroup}>
              {/* Botón Principal: Iniciar Sesión */}
              <PrimaryButton
                label={t('common:actions.login')}
                onPress={() => router.push(APP_ROUTES.AUTH.LOGIN as never)}
                accessibilityLabel={t('common:actions.login')}
              />

              {/* Botón Secundario: Registrarse */}
              <SecondaryButton
                label={t('common:actions.register')}
                onPress={() => router.push(APP_ROUTES.AUTH.SELECT_ROLE as never)}
                accessibilityLabel={t('common:actions.register')}
              />
            </View>

            {/* Selector de idioma */}
            <View style={styles.languageContainer}>
              <LanguageSelector showHeader={false} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SCREEN_MARGIN,
    paddingVertical: 32,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandHeader: {
    marginTop: 20,
    marginBottom: 32,
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
  languageContainer: {
    width: '100%',
    marginTop: 24,
  },
});
