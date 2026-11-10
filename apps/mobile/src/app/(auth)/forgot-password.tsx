import { ForgotPasswordInputSchema } from '@nutrikids/shared';
import { Link, useRouter } from 'expo-router';
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
import { forgotPasswordRequest } from '../../lib/api.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';

export default function ForgotPasswordScreen() {
  const router = useRouter();
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brandTitle}>NutriKids</Text>
          <Text style={styles.brandSubtitle}>Recuperar Contraseña</Text>
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
                <Text style={styles.successBoxTitle}>Solicitud Enviada</Text>
                <Text style={styles.successBoxText}>{successMessage}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={() => router.push(APP_ROUTES.AUTH.RESET_PASSWORD as never)}
              >
                <Text style={styles.submitButtonText}>Ingresar Token de Recuperación</Text>
              </Pressable>

              <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
                <Pressable style={styles.backButton}>
                  <Text style={styles.backButtonText}>Volver al inicio de sesión</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <>
              <Text style={styles.instructions}>
                Ingresa el correo electrónico asociado a tu cuenta y te enviaremos las instrucciones
                y el token para restablecer tu contraseña.
              </Text>

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

              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={() => void handleSubmit()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Enviar Instrucciones</Text>
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
  backButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '600',
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
