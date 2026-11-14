import { Ionicons } from '@expo/vector-icons';
import { LoginInputSchema } from '@nutrikids/shared';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { loginRequest } from '../../lib/api.js';
import {
  AuthApiError,
  extractZodFieldErrors,
  formatAuthErrorMessage,
} from '../../lib/auth-errors.js';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);
  const { signIn } = useAuth();

  const passwordRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Two-factor state for professionals (NK-14 integration)
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [isUsingRecoveryCode, setIsUsingRecoveryCode] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleLoginSubmit = async () => {
    setGeneralError(null);
    setFieldErrors({});

    const payload = {
      email: email.trim(),
      password,
      ...(requiresTwoFactor && !isUsingRecoveryCode ? { totpCode: totpCode.trim() } : {}),
      ...(requiresTwoFactor && isUsingRecoveryCode ? { recoveryCode: recoveryCode.trim() } : {}),
    };

    const validation = LoginInputSchema.safeParse(payload);
    if (!validation.success) {
      setFieldErrors(extractZodFieldErrors(validation.error));
      return;
    }

    setLoading(true);
    try {
      const response = await loginRequest(validation.data);

      if (response.requiresTwoFactor) {
        setRequiresTwoFactor(true);
      } else {
        await signIn(response);
      }
    } catch (err) {
      if (requiresTwoFactor && err instanceof AuthApiError && err.status === 401) {
        setGeneralError(t('login.invalidCode'));
      } else {
        setGeneralError(formatAuthErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetToCredentials = () => {
    setRequiresTwoFactor(false);
    setIsUsingRecoveryCode(false);
    setTotpCode('');
    setRecoveryCode('');
    setGeneralError(null);
    setFieldErrors({});
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

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header con Logo y Slogan estilo UI final */}
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
          <Text style={styles.title}>
            {requiresTwoFactor ? t('login.twoFactorTitle') : t('login.title')}
          </Text>
          {generalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {!requiresTwoFactor ? (
            <>
              {/* Email Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('login.emailLabel')}</Text>
                <KeyboardAwareTextInput
                  style={[styles.input, fieldErrors['email'] ? styles.inputError : undefined]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (fieldErrors['email']) {
                      setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder={t('login.emailPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />
                {fieldErrors['email'] ? (
                  <Text style={styles.errorText}>{fieldErrors['email']}</Text>
                ) : null}
              </View>

              {/* Password Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('login.passwordLabel')}</Text>
                <View
                  style={[
                    styles.passwordContainer,
                    fieldErrors['password'] ? styles.inputError : undefined,
                  ]}
                >
                  <KeyboardAwareTextInput
                    ref={passwordRef}
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (fieldErrors['password']) {
                        setFieldErrors((prev) => ({ ...prev, password: '' }));
                      }
                    }}
                    placeholder={t('login.passwordPlaceholder')}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => void handleLoginSubmit()}
                    editable={!loading}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={8}
                    accessibilityLabel={
                      showPassword ? t('common:password.hide') : t('common:password.show')
                    }
                  >
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#374151" />
                  </Pressable>
                </View>
                {fieldErrors['password'] ? (
                  <Text style={styles.errorText}>{fieldErrors['password']}</Text>
                ) : null}
              </View>

              {/* Forgot Password Link */}
              <View style={styles.forgotPasswordContainer}>
                <Link href={APP_ROUTES.AUTH.FORGOT_PASSWORD} asChild>
                  <Pressable hitSlop={6}>
                    <Text style={styles.forgotPasswordText}>{t('login.forgotPassword')}</Text>
                  </Pressable>
                </Link>
              </View>

              {/* Submit Button */}
              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={() => void handleLoginSubmit()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('login.submit')}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {/* Step 2: Two-Factor Code (TOTP / Recovery) */}
              <Text style={styles.stepDescription}>{t('login.twoFactorDescription')}</Text>

              {!isUsingRecoveryCode ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('login.totpLabel')}</Text>
                  <KeyboardAwareTextInput
                    style={[styles.input, fieldErrors['totpCode'] ? styles.inputError : undefined]}
                    value={totpCode}
                    onChangeText={(text) => {
                      setTotpCode(text.replace(/\D/g, '').slice(0, 6));
                      if (fieldErrors['totpCode']) {
                        setFieldErrors((prev) => ({ ...prev, totpCode: '' }));
                      }
                    }}
                    placeholder={t('login.totpPlaceholder')}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                  {fieldErrors['totpCode'] ? (
                    <Text style={styles.errorText}>{fieldErrors['totpCode']}</Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('login.recoveryLabel')}</Text>
                  <KeyboardAwareTextInput
                    style={[
                      styles.input,
                      fieldErrors['recoveryCode'] ? styles.inputError : undefined,
                    ]}
                    value={recoveryCode}
                    onChangeText={(text) => {
                      setRecoveryCode(text);
                      if (fieldErrors['recoveryCode']) {
                        setFieldErrors((prev) => ({ ...prev, recoveryCode: '' }));
                      }
                    }}
                    placeholder={t('login.recoveryPlaceholder')}
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                  {fieldErrors['recoveryCode'] ? (
                    <Text style={styles.errorText}>{fieldErrors['recoveryCode']}</Text>
                  ) : null}
                </View>
              )}

              {/* Alternate between TOTP and Recovery Code */}
              <Pressable
                onPress={() => {
                  setIsUsingRecoveryCode((prev) => !prev);
                  setGeneralError(null);
                  setFieldErrors({});
                }}
                style={styles.switchModeButton}
              >
                <Text style={styles.switchModeText}>
                  {isUsingRecoveryCode ? t('login.useAuthenticator') : t('login.useRecovery')}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={() => void handleLoginSubmit()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('login.verifySubmit')}</Text>
                )}
              </Pressable>

              <Pressable onPress={handleResetToCredentials} style={styles.cancelTwoFactorButton}>
                <Text style={styles.cancelTwoFactorText}>{t('login.backToLogin')}</Text>
              </Pressable>
            </>
          )}

          {/* Registration Link */}
          {!requiresTwoFactor && (
            <View style={styles.registerContainer}>
              <Text style={styles.registerPrompt}>{t('login.noAccount')}</Text>
              <Link href={APP_ROUTES.AUTH.SELECT_ROLE} asChild>
                <Pressable hitSlop={6}>
                  <Text style={styles.registerLink}>{t('login.registerLink')}</Text>
                </Pressable>
              </Link>
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
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
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: PALETTE.primary,
    textDecorationLine: 'underline',
    fontWeight: '500',
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
  stepDescription: {
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 19,
  },
  switchModeButton: {
    marginTop: -4,
  },
  switchModeText: {
    fontSize: 12,
    color: PALETTE.primary,
    fontWeight: '600',
  },
  cancelTwoFactorButton: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  cancelTwoFactorText: {
    fontSize: 13,
    color: PALETTE.text.muted,
    fontWeight: '600',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  registerPrompt: {
    fontSize: 13,
    color: PALETTE.text.body,
  },
  registerLink: {
    fontSize: 13,
    color: PALETTE.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
