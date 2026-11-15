import { Ionicons } from '@expo/vector-icons';
import { ForgotPasswordInputSchema } from '@nutrikids/shared';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader, authStyles } from '../../components/auth/AuthBrandHeader.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { PillField } from '../../components/ui/PillField.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { BackButton } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { forgotPasswordRequest } from '../../lib/api.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setGeneralError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    const validation = ForgotPasswordInputSchema.safeParse({ email: email.trim() });
    if (!validation.success) {
      setFieldErrors(extractZodFieldErrors(validation.error));
      return;
    }

    setLoading(true);
    try {
      const response = await forgotPasswordRequest(validation.data);
      setSuccessMessage(response.message);
    } catch (err) {
      setGeneralError(formatAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
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

      <KeyboardAwareScrollView
        style={authStyles.scrollView}
        contentContainerStyle={authStyles.scrollContent}
      >
        <AuthBrandHeader />

        <View style={authStyles.formContainer}>
          <Text style={authStyles.title}>{t('forgotPassword.title')}</Text>
          {generalError && (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {successMessage ? (
            <View style={authStyles.successContainer}>
              <View style={authStyles.successBox}>
                <Text style={authStyles.successBoxTitle}>{t('forgotPassword.successTitle')}</Text>
                <Text style={authStyles.successBoxText}>{successMessage}</Text>
              </View>

              <PrimaryButton
                label={t('forgotPassword.enterToken')}
                onPress={() => router.push(APP_ROUTES.AUTH.RESET_PASSWORD)}
              />

              <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                <Pressable hitSlop={6} style={authStyles.backToLoginLink}>
                  <Ionicons name="arrow-back" size={18} color={PALETTE.primary} />
                  <Text style={authStyles.backToLoginText}>{t('forgotPassword.backToLogin')}</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <>
              <Text style={styles.instructions}>{t('forgotPassword.instructions')}</Text>

              <PillField label={t('forgotPassword.emailLabel')} error={fieldErrors['email']}>
                <KeyboardAwareTextInput
                  style={authStyles.pillInput}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (fieldErrors['email']) {
                      setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                  editable={!loading}
                />
              </PillField>

              <PrimaryButton
                label={t('forgotPassword.submit')}
                onPress={() => void handleSubmit()}
                loading={loading}
                style={styles.submitButton}
              />

              <View style={styles.footerRow}>
                <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                  <Pressable hitSlop={6} style={authStyles.backToLoginLink}>
                    <Ionicons name="arrow-back" size={18} color={PALETTE.primary} />
                    <Text style={authStyles.backToLoginText}>
                      {t('forgotPassword.backToLogin')}
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  instructions: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 8,
  },
  footerRow: {
    alignItems: 'center',
    marginTop: 4,
  },
});
