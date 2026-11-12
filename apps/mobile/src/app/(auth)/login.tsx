import { Ionicons } from '@expo/vector-icons';
import { LoginInputSchema } from '@nutrikids/shared';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { loginRequest } from '../../lib/api.js';
import {
  AuthApiError,
  extractZodFieldErrors,
  formatAuthErrorMessage,
} from '../../lib/auth-errors.js';

export default function LoginScreen() {
  const { signIn } = useAuth();

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
        setGeneralError('Código incorrecto o vencido. Inténtalo nuevamente.');
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brandTitle}>NutriKids</Text>
          <Text style={styles.brandSubtitle}>
            {requiresTwoFactor ? 'Verificación en Dos Pasos' : 'Iniciar Sesión'}
          </Text>
        </View>

        <View style={styles.card}>
          {generalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {!requiresTwoFactor ? (
            <>
              {/* Email Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Correo electrónico</Text>
                <TextInput
                  style={[styles.input, fieldErrors['email'] ? styles.inputError : undefined]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (fieldErrors['email']) {
                      setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder="ejemplo@correo.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                {fieldErrors['email'] ? (
                  <Text style={styles.errorText}>{fieldErrors['email']}</Text>
                ) : null}
              </View>

              {/* Password Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[
                      styles.passwordInput,
                      fieldErrors['password'] ? styles.inputError : undefined,
                    ]}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (fieldErrors['password']) {
                        setFieldErrors((prev) => ({ ...prev, password: '' }));
                      }
                    }}
                    placeholder="Tu contraseña"
                    placeholderTextColor="#9CA3AF"
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
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#4B5563"
                    />
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
                    <Text style={styles.forgotPasswordText}>Olvidé mi contraseña</Text>
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
                  <Text style={styles.submitButtonText}>Entrar</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {/* Step 2: Two-Factor Code (TOTP / Recovery) */}
              <Text style={styles.stepDescription}>
                Tu cuenta profesional requiere verificación en dos pasos. Ingresa el código de 6
                dígitos de tu aplicación autenticadora.
              </Text>

              {!isUsingRecoveryCode ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Código de autenticación (6 dígitos)</Text>
                  <TextInput
                    style={[styles.input, fieldErrors['totpCode'] ? styles.inputError : undefined]}
                    value={totpCode}
                    onChangeText={(text) => {
                      setTotpCode(text.replace(/\D/g, '').slice(0, 6));
                      if (fieldErrors['totpCode']) {
                        setFieldErrors((prev) => ({ ...prev, totpCode: '' }));
                      }
                    }}
                    placeholder="123456"
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
                  <Text style={styles.label}>Código de recuperación</Text>
                  <TextInput
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
                    placeholder="Ingresa tu código de respaldo"
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
                  {isUsingRecoveryCode
                    ? 'Usar código de la aplicación autenticadora'
                    : 'No tengo acceso a mi app, usar código de recuperación'}
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
                  <Text style={styles.submitButtonText}>Verificar e Iniciar Sesión</Text>
                )}
              </Pressable>

              <Pressable onPress={handleResetToCredentials} style={styles.cancelTwoFactorButton}>
                <Text style={styles.cancelTwoFactorText}>Volver al inicio de sesión</Text>
              </Pressable>
            </>
          )}

          {/* Registration Link */}
          {!requiresTwoFactor && (
            <View style={styles.registerContainer}>
              <Text style={styles.registerPrompt}>No tienes cuenta?</Text>
              <Link href={APP_ROUTES.AUTH.REGISTER} asChild>
                <Pressable hitSlop={6}>
                  <Text style={styles.registerLink}>Crear cuenta</Text>
                </Pressable>
              </Link>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#14532D',
  },
  brandSubtitle: {
    fontSize: 16,
    color: '#4B5563',
    marginTop: 4,
    fontWeight: '600',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBoxText: {
    color: '#DC2626',
    fontSize: 13,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stepDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  switchModeButton: {
    marginTop: -4,
  },
  switchModeText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  cancelTwoFactorButton: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  cancelTwoFactorText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 16,
  },
  registerPrompt: {
    fontSize: 14,
    color: '#6B7280',
  },
  registerLink: {
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '700',
  },
});
