import { Ionicons } from '@expo/vector-icons';
import { RegisterInputSchema, USER_ROLES, type Specialty, type UserRole } from '@nutrikids/shared';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { useAuth } from '../../context/auth-context.js';
import { registerRequest } from '../../lib/api.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';

const SPECIALTIES: Array<{ value: Specialty; label: string }> = [
  { value: 'pediatrics', label: 'Pediatría' },
  { value: 'nutrition', label: 'Nutrición' },
  { value: 'nursing', label: 'Enfermería' },
];

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { signIn } = useAuth();

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
      setFieldErrors({ confirmPassword: 'Las contraseñas no coinciden' });
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
    <SafeAreaView style={styles.container}>
      {/* Botón Volver */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Volver a la pantalla anterior"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header con Logo y Slogan */}
        <View style={styles.brandHeader}>
          <Image
            source={APP_ASSETS.LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="NutriKids Logo"
          />
          <Text style={styles.slogan}>Cuidar su crecimiento, juntos.</Text>
          <View style={styles.orangeDivider} />
        </View>

        {/* Formulario */}
        <View style={styles.formContainer}>
          <Text style={styles.title}>Crear Cuenta</Text>

          {/* Indicador del perfil elegido con opción de cambiar */}
          <View style={styles.roleBadgeRow}>
            <Text style={styles.roleBadgeText}>
              Perfil: {isProfessional ? 'Profesional de Salud' : 'Cuidador'}
            </Text>
            <Link href={APP_ROUTES.AUTH.SELECT_ROLE} asChild>
              <Pressable hitSlop={6}>
                <Text style={styles.changeRoleLink}>Cambiar perfil</Text>
              </Pressable>
            </Link>
          </View>

          {generalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {/* Nombre */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={[styles.input, fieldErrors['firstName'] ? styles.inputError : undefined]}
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                if (fieldErrors['firstName']) {
                  setFieldErrors((prev) => ({ ...prev, firstName: '' }));
                }
              }}
              placeholder="Ingrese su nombre"
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              editable={!loading}
            />
            {fieldErrors['firstName'] ? (
              <Text style={styles.errorText}>{fieldErrors['firstName']}</Text>
            ) : null}
          </View>

          {/* Apellido */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Apellido</Text>
            <TextInput
              style={[styles.input, fieldErrors['lastName'] ? styles.inputError : undefined]}
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                if (fieldErrors['lastName']) {
                  setFieldErrors((prev) => ({ ...prev, lastName: '' }));
                }
              }}
              placeholder="Ingrese su apellido"
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              editable={!loading}
            />
            {fieldErrors['lastName'] ? (
              <Text style={styles.errorText}>{fieldErrors['lastName']}</Text>
            ) : null}
          </View>

          {/* Correo Electrónico */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Correo Electrónico</Text>
            <TextInput
              style={[styles.input, fieldErrors['email'] ? styles.inputError : undefined]}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (fieldErrors['email']) {
                  setFieldErrors((prev) => ({ ...prev, email: '' }));
                }
              }}
              placeholder="Ingrese su correo"
              placeholderTextColor={PALETTE.input.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            {fieldErrors['email'] ? (
              <Text style={styles.errorText}>{fieldErrors['email']}</Text>
            ) : null}
          </View>

          {/* Campos adicionales si eligió Profesional de Salud */}
          {isProfessional && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Especialidad</Text>
                <View style={styles.specialtiesRow}>
                  {SPECIALTIES.map((spec) => (
                    <Pressable
                      key={spec.value}
                      style={[
                        styles.specialtyChip,
                        specialty === spec.value ? styles.specialtyChipActive : undefined,
                      ]}
                      onPress={() => {
                        setSpecialty(spec.value);
                        if (fieldErrors['specialty']) {
                          setFieldErrors((prev) => ({ ...prev, specialty: '' }));
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.specialtyChipText,
                          specialty === spec.value ? styles.specialtyChipTextActive : undefined,
                        ]}
                      >
                        {spec.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {fieldErrors['specialty'] ? (
                  <Text style={styles.errorText}>{fieldErrors['specialty']}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Número de Licencia / Matrícula</Text>
                <TextInput
                  style={[
                    styles.input,
                    fieldErrors['licenseNumber'] ? styles.inputError : undefined,
                  ]}
                  value={licenseNumber}
                  onChangeText={(text) => {
                    setLicenseNumber(text);
                    if (fieldErrors['licenseNumber']) {
                      setFieldErrors((prev) => ({ ...prev, licenseNumber: '' }));
                    }
                  }}
                  placeholder="Ej: MED-12345"
                  placeholderTextColor={PALETTE.input.placeholder}
                  editable={!loading}
                />
                {fieldErrors['licenseNumber'] ? (
                  <Text style={styles.errorText}>{fieldErrors['licenseNumber']}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Código de Invitación Profesional</Text>
                <TextInput
                  style={[
                    styles.input,
                    fieldErrors['invitationCode'] ? styles.inputError : undefined,
                  ]}
                  value={invitationCode}
                  onChangeText={(text) => {
                    setInvitationCode(text);
                    if (fieldErrors['invitationCode']) {
                      setFieldErrors((prev) => ({ ...prev, invitationCode: '' }));
                    }
                  }}
                  placeholder="Código provisto por su institución"
                  placeholderTextColor={PALETTE.input.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                {fieldErrors['invitationCode'] ? (
                  <Text style={styles.errorText}>{fieldErrors['invitationCode']}</Text>
                ) : null}
              </View>
            </>
          )}

          {/* Contraseña */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <View
              style={[
                styles.passwordContainer,
                fieldErrors['password'] ? styles.inputError : undefined,
              ]}
            >
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (fieldErrors['password']) {
                    setFieldErrors((prev) => ({ ...prev, password: '' }));
                  }
                }}
                placeholder="Ingrese su contraseña"
                placeholderTextColor={PALETTE.input.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={8}
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={PALETTE.text.title}
                />
              </Pressable>
            </View>
            {fieldErrors['password'] ? (
              <Text style={styles.errorText}>{fieldErrors['password']}</Text>
            ) : null}
          </View>

          {/* Confirmar Contraseña */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirmar Contraseña</Text>
            <View
              style={[
                styles.passwordContainer,
                fieldErrors['confirmPassword'] ? styles.inputError : undefined,
              ]}
            >
              <TextInput
                style={styles.passwordInput}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (fieldErrors['confirmPassword']) {
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }
                }}
                placeholder="Ingrese nuevamente su contraseña"
                placeholderTextColor={PALETTE.input.placeholder}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                hitSlop={8}
                accessibilityLabel={
                  showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'
                }
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={PALETTE.text.title}
                />
              </Pressable>
            </View>
            {fieldErrors['confirmPassword'] ? (
              <Text style={styles.errorText}>{fieldErrors['confirmPassword']}</Text>
            ) : null}
          </View>

          {/* Submit Button */}
          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
            onPress={() => void handleRegisterSubmit()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={PALETTE.text.light} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Crear Cuenta</Text>
            )}
          </Pressable>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginPrompt}>¿Ya tienes una cuenta?</Text>
            <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
              <Pressable hitSlop={6}>
                <Text style={styles.loginLink}>Iniciar Sesión</Text>
              </Pressable>
            </Link>
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
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
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
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  changeRoleLink: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.primary,
    textDecorationLine: 'underline',
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
  specialtiesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  specialtyChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: PALETTE.input.background,
  },
  specialtyChipActive: {
    borderColor: PALETTE.primary,
    backgroundColor: PALETTE.primaryLight,
  },
  specialtyChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  specialtyChipTextActive: {
    color: PALETTE.primary,
    fontWeight: '700',
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
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
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
