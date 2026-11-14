import { Ionicons } from '@expo/vector-icons';
import { ResetPasswordInputSchema } from '@nutrikids/shared';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useKeyboardBottomInset } from '../../hooks/useKeyboardBottomInset.js';
import { resetPasswordRequest } from '../../lib/api.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);
  const params = useLocalSearchParams<{ token?: string }>();
  const keyboardInset = useKeyboardBottomInset();

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const newPasswordRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const confirmPasswordRef = useRef<React.ComponentRef<typeof TextInput>>(null);

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
    <SafeAreaView style={styles.container}>
      {/* Botón Volver */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backNavButton, pressed && styles.backButtonPressed]}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.goBack')}
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: keyboardInset > 0 ? keyboardInset + 40 : 48 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
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

        <View style={styles.formContainer}>
          <Text style={styles.title}>{t('resetPassword.title')}</Text>
          {generalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {successMessage ? (
            <View style={styles.successContainer}>
              <View style={styles.successBox}>
                <Text style={styles.successBoxTitle}>{t('resetPassword.successTitle')}</Text>
                <Text style={styles.successBoxText}>{successMessage}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={() => router.replace(APP_ROUTES.AUTH.LOGIN)}
              >
                <Text style={styles.submitButtonText}>{t('common:actions.login')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.instructions}>{t('resetPassword.instructions')}</Text>

              {/* Token */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('resetPassword.tokenLabel')}</Text>
                <TextInput
                  style={[styles.input, fieldErrors['token'] ? styles.inputError : undefined]}
                  value={token}
                  onChangeText={(text) => {
                    setToken(text);
                    if (fieldErrors['token']) {
                      setFieldErrors((prev) => ({ ...prev, token: '' }));
                    }
                  }}
                  placeholder={t('resetPassword.tokenPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => newPasswordRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />
                {fieldErrors['token'] ? (
                  <Text style={styles.errorText}>{fieldErrors['token']}</Text>
                ) : null}
              </View>

              {/* New Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('resetPassword.newPasswordLabel')}</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    ref={newPasswordRef}
                    style={[
                      styles.passwordInput,
                      fieldErrors['newPassword'] ? styles.inputError : undefined,
                    ]}
                    value={newPassword}
                    onChangeText={(text) => {
                      setNewPassword(text);
                      if (fieldErrors['newPassword']) {
                        setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
                      }
                    }}
                    placeholder={t('resetPassword.newPasswordPlaceholder')}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                    blurOnSubmit={false}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 150);
                    }}
                    editable={!loading}
                  />
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
                      name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#4B5563"
                    />
                  </Pressable>
                </View>
                {fieldErrors['newPassword'] ? (
                  <Text style={styles.errorText}>{fieldErrors['newPassword']}</Text>
                ) : null}
              </View>

              {/* Confirm Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('resetPassword.confirmPasswordLabel')}</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    ref={confirmPasswordRef}
                    style={[
                      styles.passwordInput,
                      fieldErrors['confirmPassword'] ? styles.inputError : undefined,
                    ]}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (fieldErrors['confirmPassword']) {
                        setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                      }
                    }}
                    placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSubmit()}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 150);
                    }}
                    editable={!loading}
                  />
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
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#4B5563"
                    />
                  </Pressable>
                </View>
                {fieldErrors['confirmPassword'] ? (
                  <Text style={styles.errorText}>{fieldErrors['confirmPassword']}</Text>
                ) : null}
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={() => void handleSubmit()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('resetPassword.submit')}</Text>
                )}
              </Pressable>

              <View style={styles.footerRow}>
                <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                  <Pressable hitSlop={6}>
                    <Text style={styles.footerLink}>{t('resetPassword.backToLogin')}</Text>
                  </Pressable>
                </Link>
              </View>
            </>
          )}
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
  scrollView: {
    flex: 1,
    width: '100%',
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
  backNavButton: {
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
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
    alignItems: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    marginBottom: 24,
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
  formContainer: {
    width: '100%',
    maxWidth: 380,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: PALETTE.text.title,
    textAlign: 'center',
    marginBottom: 8,
  },
  instructions: {
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBoxText: {
    color: PALETTE.feedback.error,
    fontSize: 13,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginLeft: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 14,
    color: PALETTE.text.body,
    backgroundColor: PALETTE.input.background,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
    borderRadius: 24,
    backgroundColor: PALETTE.input.background,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 14,
    color: PALETTE.text.body,
  },
  eyeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputError: {
    borderColor: PALETTE.feedback.error,
  },
  errorText: {
    color: PALETTE.feedback.error,
    fontSize: 12,
    marginLeft: 8,
  },
  submitButton: {
    backgroundColor: PALETTE.primary,
    paddingVertical: 14,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  submitButtonText: {
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '700',
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
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.feedback.success,
  },
  successBoxText: {
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 19,
  },
  footerRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  footerLink: {
    fontSize: 14,
    color: PALETTE.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
