import { Ionicons } from '@expo/vector-icons';
import { ResetPasswordInputSchema } from '@nutrikids/shared';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
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
import { resetPasswordRequest } from '../../lib/api.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);
  const params = useLocalSearchParams<{ token?: string }>();

  const newPasswordRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);
  const confirmPasswordRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);

  const [token, setToken] = useState(params.token ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setGeneralError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    // Client-side confirmation check
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: t('resetPassword.passwordsMismatch') });
      return;
    }

    const validation = ResetPasswordInputSchema.safeParse({
      token: token.trim(),
      newPassword,
    });

    if (!validation.success) {
      setFieldErrors(extractZodFieldErrors(validation.error));
      return;
    }

    setLoading(true);
    try {
      await resetPasswordRequest(validation.data);
      setSuccessMessage(t('resetPassword.successMessage'));
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
          <Text style={authStyles.title}>{t('resetPassword.title')}</Text>
          {generalError && (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {successMessage ? (
            <View style={authStyles.successContainer}>
              <View style={authStyles.successBox}>
                <Text style={authStyles.successBoxTitle}>{t('resetPassword.successTitle')}</Text>
                <Text style={authStyles.successBoxText}>{successMessage}</Text>
              </View>

              <PrimaryButton
                label={t('common:actions.login')}
                onPress={() => router.replace(APP_ROUTES.AUTH.LOGIN)}
              />
            </View>
          ) : (
            <>
              <Text style={styles.instructions}>{t('resetPassword.instructions')}</Text>

              {/* Token */}
              <PillField label={t('resetPassword.tokenLabel')} error={fieldErrors['token']}>
                <KeyboardAwareTextInput
                  style={authStyles.pillInput}
                  value={token}
                  onChangeText={(text) => {
                    setToken(text);
                    if (fieldErrors['token']) {
                      setFieldErrors((prev) => ({ ...prev, token: '' }));
                    }
                  }}
                  placeholder={t('resetPassword.tokenPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => newPasswordRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />
              </PillField>

              {/* New Password */}
              <PillField
                label={t('resetPassword.newPasswordLabel')}
                error={fieldErrors['newPassword']}
                rightIcon={
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowNewPassword((prev) => !prev)}
                    hitSlop={8}
                    accessibilityLabel={
                      showNewPassword
                        ? t('resetPassword.hideNewPassword')
                        : t('resetPassword.showNewPassword')
                    }
                  >
                    <Ionicons
                      name={showNewPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={PALETTE.text.title}
                    />
                  </Pressable>
                }
              >
                <KeyboardAwareTextInput
                  ref={newPasswordRef}
                  style={authStyles.pillInput}
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    if (fieldErrors['newPassword']) {
                      setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
                    }
                  }}
                  placeholder={t('resetPassword.newPasswordPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />
              </PillField>

              {/* Confirm Password */}
              <PillField
                label={t('resetPassword.confirmPasswordLabel')}
                error={fieldErrors['confirmPassword']}
                rightIcon={
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword((prev) => !prev)}
                    hitSlop={8}
                    accessibilityLabel={
                      showConfirmPassword
                        ? t('common:password.hideConfirmation')
                        : t('common:password.showConfirmation')
                    }
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={PALETTE.text.title}
                    />
                  </Pressable>
                }
              >
                <KeyboardAwareTextInput
                  ref={confirmPasswordRef}
                  style={authStyles.pillInput}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (fieldErrors['confirmPassword']) {
                      setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                    }
                  }}
                  placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                  editable={!loading}
                />
              </PillField>

              <PrimaryButton
                label={t('resetPassword.submit')}
                onPress={() => void handleSubmit()}
                loading={loading}
                style={styles.submitButton}
              />

              <View style={styles.footerRow}>
                <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                  <Pressable hitSlop={6} style={authStyles.backToLoginLink}>
                    <Ionicons name="arrow-back" size={18} color={PALETTE.primary} />
                    <Text style={authStyles.backToLoginText}>{t('resetPassword.backToLogin')}</Text>
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
  eyeButton: {
    padding: 4,
  },
  submitButton: {
    marginTop: 8,
  },
  footerRow: {
    alignItems: 'center',
    marginTop: 4,
  },
});
