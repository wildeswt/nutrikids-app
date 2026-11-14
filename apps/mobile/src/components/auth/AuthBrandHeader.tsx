import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import { SCREEN_MARGIN } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';

export interface AuthBrandHeaderProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * Encabezado compartido con logo, eslogan y separador naranja para las pantallas de autenticacion.
 */
export function AuthBrandHeader({ style }: AuthBrandHeaderProps) {
  const { t } = useTranslation('common');

  return (
    <View style={[authStyles.brandHeader, style]}>
      <Image
        source={APP_ASSETS.LOGO}
        style={authStyles.logo}
        resizeMode="contain"
        accessibilityLabel={t('brand.logoLabel')}
      />
      <Text style={authStyles.slogan}>{t('brand.slogan')}</Text>
      <View style={authStyles.orangeDivider} />
    </View>
  );
}

export const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  topBar: {
    width: '100%',
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 48,
    alignItems: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    marginBottom: 24,
  },
  logo: {
    width: 300,
    height: 85,
  },
  slogan: {
    fontFamily: font('regular'),
    fontSize: 17,
    color: PALETTE.text.body,
    marginTop: 12,
    textAlign: 'center',
  },
  orangeDivider: {
    width: '100%',
    height: 4,
    backgroundColor: PALETTE.secondary,
    borderRadius: 2,
    marginTop: 18,
  },
  formContainer: {
    width: '100%',
    maxWidth: 380,
    gap: 16,
  },
  title: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 32,
    color: PALETTE.text.title,
    textAlign: 'center',
    marginBottom: 4,
  },
  pillInput: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    height: '100%',
    paddingVertical: 0,
  },
  errorBox: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorBoxText: {
    fontFamily: font('regular'),
    color: PALETTE.feedback.error,
    fontSize: 13,
    lineHeight: 18,
  },
  successContainer: {
    gap: 16,
  },
  successBox: {
    backgroundColor: PALETTE.feedback.successBg,
    borderColor: PALETTE.feedback.success,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  successBoxTitle: {
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.feedback.success,
  },
  successBoxText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 19,
  },
  footerPromptRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  footerPromptText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
  },
  footerPromptLink: {
    fontFamily: font('semibold'),
    fontSize: 13,
    color: PALETTE.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  backToLoginLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  backToLoginText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.primary,
  },
});
