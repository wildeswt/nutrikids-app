import { Ionicons } from '@expo/vector-icons';
import { RegisterInputSchema, USER_ROLES, type Specialty, type UserRole } from '@nutrikids/shared';
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
  const { signIn } = useAuth();

  const [roles, setRoles] = useState<UserRole[]>([USER_ROLES.CAREGIVER]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Professional-specific fields
  const [specialty, setSpecialty] = useState<Specialty | ''>('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [invitationCode, setInvitationCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isProfessional = roles.includes(USER_ROLES.PROFESSIONAL);

  const toggleRole = (targetRole: UserRole) => {
    setRoles((current) => {
      const exists = current.includes(targetRole);
      if (exists) {
        if (current.length === 1) return current; // Keep at least one role
        return current.filter((r) => r !== targetRole);
      }
      return [...current, targetRole];
    });
    setFieldErrors({});
  };

  const handleRegisterSubmit = async () => {
    setGeneralError(null);
    setFieldErrors({});

    // Client-side password confirmation check
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Las contraseñas no coinciden' });
      return;
    }

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() ? phone.trim() : undefined,
      password,
      roles,
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
        // If two-factor authentication is required, direct user to login flow
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brandTitle}>NutriKids</Text>
          <Text style={styles.brandSubtitle}>Crear Cuenta</Text>
        </View>

        <View style={styles.card}>
          {generalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{generalError}</Text>
            </View>
          )}

          {/* Role Selector Chips */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tipo de Perfil</Text>
            <View style={styles.rolesRow}>
              <Pressable
                style={[
                  styles.roleChip,
                  roles.includes(USER_ROLES.CAREGIVER) ? styles.roleChipActive : undefined,
                ]}
                onPress={() => toggleRole(USER_ROLES.CAREGIVER)}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    roles.includes(USER_ROLES.CAREGIVER) ? styles.roleChipTextActive : undefined,
                  ]}
                >
                  Cuidador
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.roleChip,
                  roles.includes(USER_ROLES.PROFESSIONAL) ? styles.roleChipActive : undefined,
                ]}
                onPress={() => toggleRole(USER_ROLES.PROFESSIONAL)}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    roles.includes(USER_ROLES.PROFESSIONAL) ? styles.roleChipTextActive : undefined,
                  ]}
                >
                  Profesional de Salud
                </Text>
              </Pressable>
            </View>
            {fieldErrors['roles'] ? (
              <Text style={styles.errorText}>{fieldErrors['roles']}</Text>
            ) : null}
          </View>

          {/* Name & Last Name */}
          <View style={styles.nameRow}>
            <View style={[styles.inputGroup, styles.flex1]}>
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
                placeholder="Nombre"
                placeholderTextColor="#9CA3AF"
                editable={!loading}
              />
              {fieldErrors['firstName'] ? (
                <Text style={styles.errorText}>{fieldErrors['firstName']}</Text>
              ) : null}
            </View>

            <View style={[styles.inputGroup, styles.flex1]}>
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
                placeholder="Apellido"
                placeholderTextColor="#9CA3AF"
                editable={!loading}
              />
              {fieldErrors['lastName'] ? (
                <Text style={styles.errorText}>{fieldErrors['lastName']}</Text>
              ) : null}
            </View>
          </View>

          {/* Email */}
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

          {/* Phone (optional) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Teléfono (opcional)</Text>
            <TextInput
              style={[styles.input, fieldErrors['phone'] ? styles.inputError : undefined]}
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                if (fieldErrors['phone']) {
                  setFieldErrors((prev) => ({ ...prev, phone: '' }));
                }
              }}
              placeholder="+56 9 1234 5678"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              editable={!loading}
            />
            {fieldErrors['phone'] ? (
              <Text style={styles.errorText}>{fieldErrors['phone']}</Text>
            ) : null}
          </View>

          {/* Professional Fields Section */}
          {isProfessional && (
            <View style={styles.professionalSection}>
              <Text style={styles.sectionTitle}>Datos Profesionales</Text>

              {/* Specialty Selector */}
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

              {/* License Number */}
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
                  placeholderTextColor="#9CA3AF"
                  editable={!loading}
                />
                {fieldErrors['licenseNumber'] ? (
                  <Text style={styles.errorText}>{fieldErrors['licenseNumber']}</Text>
                ) : null}
              </View>

              {/* Invitation Code */}
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
                  placeholder="Código provisto por tu institución"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                {fieldErrors['invitationCode'] ? (
                  <Text style={styles.errorText}>{fieldErrors['invitationCode']}</Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Password */}
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
                placeholder="Mínimo 8 caracteres"
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

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirmar Contraseña</Text>
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
                placeholder="Repite tu contraseña"
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

          {/* Submit Button */}
          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
            onPress={() => void handleRegisterSubmit()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Registrarme</Text>
            )}
          </Pressable>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginPrompt}>Ya tienes una cuenta?</Text>
            <Link href={APP_ROUTES.AUTH.LOGIN} asChild>
              <Pressable hitSlop={6}>
                <Text style={styles.loginLink}>Iniciar sesión</Text>
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
    backgroundColor: '#F0FDF4',
  },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 20,
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
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 14,
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
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
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
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
  },
  rolesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  roleChipActive: {
    borderColor: '#16A34A',
    backgroundColor: '#DCFCE7',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  roleChipTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  professionalSection: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  specialtiesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  specialtyChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  specialtyChipActive: {
    borderColor: '#059669',
    backgroundColor: '#A7F3D0',
  },
  specialtyChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  specialtyChipTextActive: {
    color: '#065F46',
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 14,
  },
  loginPrompt: {
    fontSize: 14,
    color: '#6B7280',
  },
  loginLink: {
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '700',
  },
});
