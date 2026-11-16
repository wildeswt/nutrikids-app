import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES, type UserRole } from '@nutrikids/shared';
import { Link, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader, authStyles } from '../../components/auth/AuthBrandHeader.js';
import { BackButton } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';

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
    <SafeAreaView style={authStyles.container}>
      {/* Botón Volver */}
      <View style={authStyles.topBar}>
        <BackButton
          label={t('common:actions.back')}
          accessibilityLabel={t('common:actions.goBack')}
          onPress={() => router.back()}
          hitSlop={8}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={styles.contentWrapper}>
          <AuthBrandHeader style={styles.brandHeader} />

          {/* Pregunta de selección de perfil */}
          <View style={styles.questionContainer}>
            <Text style={authStyles.title}>{t('selectRole.title')}</Text>
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
            <View style={[authStyles.footerPromptRow, styles.loginContainer]}>
              <Text style={authStyles.footerPromptText}>{t('selectRole.haveAccount')}</Text>
              <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                <Pressable hitSlop={6}>
                  <Text style={authStyles.footerPromptLink}>{t('common:actions.login')}</Text>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SCREEN_MARGIN,
    paddingVertical: 28,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  brandHeader: {
    marginBottom: 28,
  },
  questionContainer: {
    width: '100%',
    alignItems: 'center',
  },
  subtitle: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
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
    borderRadius: RADIUS_PILL,
    padding: 18,
    gap: 14,
    ...CARD_SHADOW,
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
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  roleDescription: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  loginContainer: {
    marginTop: 28,
  },
});
