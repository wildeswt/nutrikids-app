import { Ionicons } from '@expo/vector-icons';
import { LoginInputSchema } from '@nutrikids/shared';
import { Link, useRouter } from 'expo-router';
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
          <Text style={authStyles.title}>
            {requiresTwoFactor ? t('login.twoFactorTitle') : t('login.title')}
          </Text>
          {generalError && (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {!requiresTwoFactor ? (
            <>
              {/* Email Field */}
              <PillField label={t('login.emailLabel')} error={fieldErrors['email']}>
                <KeyboardAwareTextInput
                  style={authStyles.pillInput}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (fieldErrors['email']) {
                      setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder={t('login.emailPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />
              </PillField>

              {/* Password Field */}
              <PillField
                label={t('login.passwordLabel')}
                error={fieldErrors['password']}
                rightIcon={
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={8}
                    accessibilityLabel={
                      showPassword ? t('common:password.hide') : t('common:password.show')
                    }
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={PALETTE.text.title}
                    />
                  </Pressable>
                }
              >
                <KeyboardAwareTextInput
                  ref={passwordRef}
                  style={authStyles.pillInput}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (fieldErrors['password']) {
                      setFieldErrors((prev) => ({ ...prev, password: '' }));
                    }
                  }}
                  placeholder={t('login.passwordPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleLoginSubmit()}
                  editable={!loading}
                />
              </PillField>

              {/* Forgot Password Link */}
              <View style={styles.forgotPasswordContainer}>
                <Link href={APP_ROUTES.AUTH.FORGOT_PASSWORD} asChild>
                  <Pressable hitSlop={6}>
                    <Text style={styles.forgotPasswordText}>{t('login.forgotPassword')}</Text>
                  </Pressable>
                </Link>
              </View>

              {/* Submit Button */}
              <PrimaryButton
                label={t('login.submit')}
                onPress={() => void handleLoginSubmit()}
                loading={loading}
                style={styles.submitButton}
              />
            </>
          ) : (
            <>
              {/* Step 2: Two-Factor Code (TOTP / Recovery) */}
              <Text style={styles.stepDescription}>{t('login.twoFactorDescription')}</Text>

              {!isUsingRecoveryCode ? (
                <PillField label={t('login.totpLabel')} error={fieldErrors['totpCode']}>
                  <KeyboardAwareTextInput
                    style={authStyles.pillInput}
                    value={totpCode}
                    onChangeText={(text) => {
                      setTotpCode(text.replace(/\D/g, '').slice(0, 6));
                      if (fieldErrors['totpCode']) {
                        setFieldErrors((prev) => ({ ...prev, totpCode: '' }));
                      }
                    }}
                    placeholder={t('login.totpPlaceholder')}
                    placeholderTextColor={PALETTE.input.placeholder}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </PillField>
              ) : (
                <PillField label={t('login.recoveryLabel')} error={fieldErrors['recoveryCode']}>
                  <KeyboardAwareTextInput
                    style={authStyles.pillInput}
                    value={recoveryCode}
                    onChangeText={(text) => {
                      setRecoveryCode(text);
                      if (fieldErrors['recoveryCode']) {
                        setFieldErrors((prev) => ({ ...prev, recoveryCode: '' }));
                      }
                    }}
                    placeholder={t('login.recoveryPlaceholder')}
                    placeholderTextColor={PALETTE.input.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </PillField>
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

              <PrimaryButton
                label={t('login.verifySubmit')}
                onPress={() => void handleLoginSubmit()}
                loading={loading}
                style={styles.submitButton}
              />

              <Pressable onPress={handleResetToCredentials} style={styles.cancelTwoFactorButton}>
                <Text style={styles.cancelTwoFactorText}>{t('login.backToLogin')}</Text>
              </Pressable>
            </>
          )}

          {/* Registration Link */}
          {!requiresTwoFactor && (
            <View style={authStyles.footerPromptRow}>
              <Text style={authStyles.footerPromptText}>{t('login.noAccount')}</Text>
              <Link href={APP_ROUTES.AUTH.SELECT_ROLE} asChild>
                <Pressable hitSlop={6}>
                  <Text style={authStyles.footerPromptLink}>{t('login.registerLink')}</Text>
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
  eyeButton: {
    padding: 4,
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginTop: -6,
  },
  forgotPasswordText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.primary,
    textDecorationLine: 'underline',
  },
  submitButton: {
    marginTop: 8,
  },
  stepDescription: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
  },
  switchModeButton: {
    marginTop: -4,
  },
  switchModeText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 12,
    color: PALETTE.primary,
  },
  cancelTwoFactorButton: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  cancelTwoFactorText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.text.muted,
  },
});
