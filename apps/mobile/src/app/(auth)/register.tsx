import { Ionicons } from '@expo/vector-icons';
import { RegisterInputSchema, USER_ROLES, type Specialty, type UserRole } from '@nutrikids/shared';
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
import { RADIUS_PILL } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { registerRequest } from '../../lib/api.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';

const SPECIALTIES: Specialty[] = ['pediatrics', 'nutrition', 'nursing'];

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);
  const params = useLocalSearchParams<{ role?: string }>();
  const { signIn } = useAuth();

  const lastNameRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);
  const emailRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);
  const licenseNumberRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);
  const invitationCodeRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);
  const passwordRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);
  const confirmPasswordRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);

  const selectedRole: UserRole =
    params.role === USER_ROLES.PROFESSIONAL ? USER_ROLES.PROFESSIONAL : USER_ROLES.CAREGIVER;
  const isProfessional = selectedRole === USER_ROLES.PROFESSIONAL;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Campos exclusivos para Profesional de Salud
  const [specialty, setSpecialty] = useState<Specialty | ''>('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [invitationCode, setInvitationCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleRegisterSubmit = async () => {
    setGeneralError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: t('register.passwordsMismatch') });
      return;
    }

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
      roles: [selectedRole],
      ...(isProfessional
        ? {
            specialty: specialty || undefined,
            licenseNumber: licenseNumber.trim() || undefined,
            invitationCode: invitationCode.trim() || undefined,
          }
        : {}),
    };

    const validation = RegisterInputSchema.safeParse(payload);
    if (!validation.success) {
      setFieldErrors(extractZodFieldErrors(validation.error));
      return;
    }

    setLoading(true);
    try {
      const response = await registerRequest(validation.data);
      if (!response.requiresTwoFactor) {
        await signIn(response);
      } else {
        router.replace(APP_ROUTES.AUTH.LOGIN);
      }
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
        contentContainerStyle={[authStyles.scrollContent, styles.scrollContentBottom]}
      >
        <AuthBrandHeader />

        {/* Formulario */}
        <View style={authStyles.formContainer}>
          <Text style={authStyles.title}>{t('register.title')}</Text>

          {/* Indicador del perfil elegido con opción de cambiar */}
          <View style={styles.roleBadgeRow}>
            <Text style={styles.roleBadgeText}>
              {t('register.roleBadge', { role: t(`common:roles.${selectedRole}`) })}
            </Text>
            <Link href={APP_ROUTES.AUTH.SELECT_ROLE} asChild>
              <Pressable hitSlop={6}>
                <Text style={styles.changeRoleLink}>{t('register.changeRole')}</Text>
              </Pressable>
            </Link>
          </View>

          {generalError && (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {/* Nombre */}
          <PillField label={t('register.firstNameLabel')} error={fieldErrors['firstName']}>
            <KeyboardAwareTextInput
              style={authStyles.pillInput}
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                if (fieldErrors['firstName']) {
                  setFieldErrors((prev) => ({ ...prev, firstName: '' }));
                }
              }}
              placeholder={t('register.firstNamePlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => lastNameRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading}
            />
          </PillField>

          {/* Apellido */}
          <PillField label={t('register.lastNameLabel')} error={fieldErrors['lastName']}>
            <KeyboardAwareTextInput
              ref={lastNameRef}
              style={authStyles.pillInput}
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                if (fieldErrors['lastName']) {
                  setFieldErrors((prev) => ({ ...prev, lastName: '' }));
                }
              }}
              placeholder={t('register.lastNamePlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading}
            />
          </PillField>

          {/* Correo Electrónico */}
          <PillField label={t('register.emailLabel')} error={fieldErrors['email']}>
            <KeyboardAwareTextInput
              ref={emailRef}
              style={authStyles.pillInput}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (fieldErrors['email']) {
                  setFieldErrors((prev) => ({ ...prev, email: '' }));
                }
              }}
              placeholder={t('register.emailPlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (isProfessional) {
                  licenseNumberRef.current?.focus();
                } else {
                  passwordRef.current?.focus();
                }
              }}
              blurOnSubmit={false}
              editable={!loading}
            />
          </PillField>

          {/* Campos adicionales si eligió Profesional de Salud */}
          {isProfessional && (
            <>
              <View style={styles.specialtyGroup}>
                <Text style={styles.fieldLabel}>{t('register.specialtyLabel')}</Text>
                <View style={styles.specialtiesRow}>
                  {SPECIALTIES.map((spec) => (
                    <Pressable
                      key={spec}
                      style={[
                        styles.specialtyChip,
                        specialty === spec ? styles.specialtyChipActive : undefined,
                      ]}
                      onPress={() => {
                        setSpecialty(spec);
                        if (fieldErrors['specialty']) {
                          setFieldErrors((prev) => ({ ...prev, specialty: '' }));
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.specialtyChipText,
                          specialty === spec ? styles.specialtyChipTextActive : undefined,
                        ]}
                      >
                        {t(`common:specialties.${spec}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {fieldErrors['specialty'] ? (
                  <Text style={styles.errorText}>{fieldErrors['specialty']}</Text>
                ) : null}
              </View>

              <PillField label={t('register.licenseLabel')} error={fieldErrors['licenseNumber']}>
                <KeyboardAwareTextInput
                  ref={licenseNumberRef}
                  style={authStyles.pillInput}
                  value={licenseNumber}
                  onChangeText={(text) => {
                    setLicenseNumber(text);
                    if (fieldErrors['licenseNumber']) {
                      setFieldErrors((prev) => ({ ...prev, licenseNumber: '' }));
                    }
                  }}
                  placeholder={t('register.licensePlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  returnKeyType="next"
                  onSubmitEditing={() => invitationCodeRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />
              </PillField>

              <PillField
                label={t('register.invitationLabel')}
                error={fieldErrors['invitationCode']}
              >
                <KeyboardAwareTextInput
                  ref={invitationCodeRef}
                  style={authStyles.pillInput}
                  value={invitationCode}
                  onChangeText={(text) => {
                    setInvitationCode(text);
                    if (fieldErrors['invitationCode']) {
                      setFieldErrors((prev) => ({ ...prev, invitationCode: '' }));
                    }
                  }}
                  placeholder={t('register.invitationPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />
              </PillField>
            </>
          )}

          {/* Contraseña */}
          <PillField
            label={t('register.passwordLabel')}
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
              placeholder={t('register.passwordPlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading}
            />
          </PillField>

          {/* Confirmar Contraseña */}
          <PillField
            label={t('register.confirmPasswordLabel')}
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
              placeholder={t('register.confirmPasswordPlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void handleRegisterSubmit()}
              editable={!loading}
            />
          </PillField>

          {/* Submit Button */}
          <PrimaryButton
            label={t('register.submit')}
            onPress={() => void handleRegisterSubmit()}
            loading={loading}
            style={styles.submitButton}
          />

          {/* Login Link */}
          <View style={authStyles.footerPromptRow}>
            <Text style={authStyles.footerPromptText}>{t('register.haveAccount')}</Text>
            <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
              <Pressable hitSlop={6}>
                <Text style={authStyles.footerPromptLink}>{t('common:actions.login')}</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContentBottom: {
    paddingBottom: 64,
  },
  roleBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  roleBadgeText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.text.body,
  },
  changeRoleLink: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.primary,
    textDecorationLine: 'underline',
  },
  specialtyGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
  },
  specialtiesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  specialtyChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    borderRadius: RADIUS_PILL,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: PALETTE.input.background,
  },
  specialtyChipActive: {
    borderColor: PALETTE.primary,
    backgroundColor: PALETTE.primaryLight,
  },
  specialtyChipText: {
    fontFamily: font('medium'),
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  specialtyChipTextActive: {
    fontFamily: font('semibold'),
    color: PALETTE.primary,
    fontWeight: '600',
  },
  errorText: {
    fontFamily: font('regular'),
    color: PALETTE.feedback.error,
    fontSize: 13,
  },
  eyeButton: {
    padding: 4,
  },
  submitButton: {
    marginTop: 8,
  },
});
