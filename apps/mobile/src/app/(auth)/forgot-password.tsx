import { Ionicons } from '@expo/vector-icons';
import { ForgotPasswordInputSchema } from '@nutrikids/shared';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
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
      {/* Botón Volver */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backNavButton, pressed && styles.backButtonPressed]}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Volver a la pantalla anterior"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
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

        <View style={styles.formContainer}>
          <Text style={styles.title}>Recuperar Contraseña</Text>
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
                onPress={() => router.push(APP_ROUTES.AUTH.RESET_PASSWORD)}
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
                <KeyboardAwareTextInput
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
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
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
  backButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    color: PALETTE.primary,
    fontWeight: '600',
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
