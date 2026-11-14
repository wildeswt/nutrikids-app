import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES, type UserRole } from '@nutrikids/shared';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';

export default function SelectRoleScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);

  const handleSelectRole = (role: UserRole) => {
    router.push({
      pathname: APP_ROUTES.AUTH.REGISTER,
      params: { role },
    } as never);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Botón Volver */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.goBack')}
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        </Pressable>
      </View>

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

          {/* Pregunta de selección de perfil */}
          <View style={styles.questionContainer}>
            <Text style={styles.title}>{t('selectRole.title')}</Text>
            <Text style={styles.subtitle}>{t('selectRole.subtitle')}</Text>

            <View style={styles.optionsGroup}>
              {/* Opción 1: Cuidador / Representante */}
              <Pressable
                style={({ pressed }) => [styles.roleCard, pressed && styles.buttonPressed]}
                onPress={() => handleSelectRole(USER_ROLES.CAREGIVER)}
                accessibilityRole="button"
                accessibilityLabel={t('selectRole.caregiverA11y')}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="people-outline" size={26} color={PALETTE.primary} />
                </View>
                <View style={styles.roleTextContainer}>
                  <Text style={styles.roleTitle}>{t('selectRole.caregiverTitle')}</Text>
                  <Text style={styles.roleDescription}>{t('selectRole.caregiverDescription')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={PALETTE.primary} />
              </Pressable>

              {/* Opción 2: Profesional de Salud */}
              <Pressable
                style={({ pressed }) => [styles.roleCard, pressed && styles.buttonPressed]}
                onPress={() => handleSelectRole(USER_ROLES.PROFESSIONAL)}
                accessibilityRole="button"
                accessibilityLabel={t('selectRole.professionalTitle')}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="medkit-outline" size={26} color={PALETTE.primary} />
                </View>
                <View style={styles.roleTextContainer}>
                  <Text style={styles.roleTitle}>{t('selectRole.professionalTitle')}</Text>
                  <Text style={styles.roleDescription}>
                    {t('selectRole.professionalDescription')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={PALETTE.primary} />
              </Pressable>
            </View>

            {/* Enlace a Iniciar Sesión */}
            <View style={styles.loginContainer}>
              <Text style={styles.loginPrompt}>{t('selectRole.haveAccount')}</Text>
              <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                <Pressable hitSlop={6}>
                  <Text style={styles.loginLink}>{t('common:actions.login')}</Text>
                </Pressable>
              </Link>
            </View>
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
  topBar: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
  },
  backButtonPressed: {
    opacity: 0.7,
    backgroundColor: PALETTE.border.subtle,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 28,
  },
  logo: {
    width: 300,
    height: 85,
  },
  slogan: {
    fontSize: 16,
    color: PALETTE.text.body,
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
  },
  orangeDivider: {
    width: '90%',
    height: 4,
    backgroundColor: PALETTE.secondary,
    borderRadius: 2,
    marginTop: 18,
  },
  questionContainer: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: PALETTE.text.title,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  optionsGroup: {
    width: '100%',
    gap: 16,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTextContainer: {
    flex: 1,
    gap: 4,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  roleDescription: {
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 28,
  },
  loginPrompt: {
    fontSize: 13,
    color: PALETTE.text.body,
  },
  loginLink: {
    fontSize: 13,
    color: PALETTE.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
