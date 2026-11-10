import { Ionicons } from '@expo/vector-icons';
import { ResetPasswordInputSchema } from '@nutrikids/shared';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
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
import { resetPasswordRequest } from '../../lib/api.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();

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
      setFieldErrors({ confirmPassword: 'Las contraseñas no coinciden' });
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
      setSuccessMessage(
        'Tu contraseña ha sido restablecida exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.',
      );
    } catch (err) {
      setGeneralError(formatAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brandTitle}>NutriKids</Text>
          <Text style={styles.brandSubtitle}>Nueva Contraseña</Text>
        </View>

        <View style={styles.card}>
          {generalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {successMessage ? (
            <View style={styles.successContainer}>
              <View style={styles.successBox}>
                <Text style={styles.successBoxTitle}>Contraseña Restablecida</Text>
                <Text style={styles.successBoxText}>{successMessage}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={() => router.replace(APP_ROUTES.AUTH.LOGIN as never)}
              >
                <Text style={styles.submitButtonText}>Iniciar Sesión</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.instructions}>
                Ingresa el token de recuperación recibido por correo y tu nueva contraseña.
              </Text>

              {/* Token */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Token de recuperación</Text>
                <TextInput
                  style={[styles.input, fieldErrors['token'] ? styles.inputError : undefined]}
                  value={token}
                  onChangeText={(text) => {
                    setToken(text);
                    if (fieldErrors['token']) {
                      setFieldErrors((prev) => ({ ...prev, token: '' }));
                    }
                  }}
                  placeholder="Pega el código recibido"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                {fieldErrors['token'] ? (
                  <Text style={styles.errorText}>{fieldErrors['token']}</Text>
                ) : null}
              </View>

              {/* New Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nueva contraseña</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
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
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowNewPassword((prev) => !prev)}
                    hitSlop={8}
                    accessibilityLabel={
                      showNewPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'
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
                <Text style={styles.label}>Confirmar nueva contraseña</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
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
                    placeholder="Repite la nueva contraseña"
                    placeholderTextColor="#9CA3AF"
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
                  <Text style={styles.submitButtonText}>Actualizar Contraseña</Text>
                )}
              </Pressable>

              <View style={styles.footerRow}>
                <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                  <Pressable hitSlop={6}>
                    <Text style={styles.footerLink}>Volver al inicio de sesión</Text>
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
  instructions: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
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
  successContainer: {
    gap: 16,
  },
  successBox: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  successBoxTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803D',
  },
  successBoxText: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 19,
  },
  footerRow: {
    alignItems: 'center',
    marginTop: 6,
  },
  footerLink: {
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '600',
  },
});
