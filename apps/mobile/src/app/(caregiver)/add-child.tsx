import { Ionicons } from '@expo/vector-icons';
import {
  CreateChildInputSchema,
  MAX_CHILD_AGE_MONTHS,
  MIN_CHILD_AGE_MONTHS,
  completedMonths,
  todayIsoDate,
  type Sex,
} from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
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
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useKeyboardBottomInset } from '../../hooks/useKeyboardBottomInset.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';
import { buildCreateChildPayload } from '../../lib/child-form.js';
import { createChild } from '../../lib/children-api.js';

const RELATIONSHIP_OPTIONS = ['Madre', 'Padre', 'Tutor Legal'] as const;

export default function AddChildScreen() {
  const router = useRouter();
  const keyboardInset = useKeyboardBottomInset();

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const lastNameRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const dayRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const monthRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const yearRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [sex, setSex] = useState<Sex>('MALE');
  const [relationship, setRelationship] = useState<string>('Madre');
  const [isLegalRepresentative, setIsLegalRepresentative] = useState(true);

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Construir fecha ISO YYYY-MM-DD si los 3 campos están completos
  const formattedDay = birthDay.padStart(2, '0');
  const formattedMonth = birthMonth.padStart(2, '0');
  const birthDateIso =
    birthYear.length === 4 && birthMonth.length > 0 && birthDay.length > 0
      ? `${birthYear}-${formattedMonth}-${formattedDay}`
      : '';

  // Cálculo de edad preliminar en meses para feedback en tiempo real
  let calculatedMonths: number | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthDateIso)) {
    try {
      calculatedMonths = completedMonths(birthDateIso, todayIsoDate());
    } catch {
      calculatedMonths = null;
    }
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME as never);
    }
  };

  const handleSubmit = async () => {
    setGeneralError(null);
    setFieldErrors({});

    const payload = buildCreateChildPayload({
      firstName,
      lastName,
      birthDay,
      birthMonth,
      birthYear,
      sex,
      relationship,
      isLegalRepresentative,
    });

    const validation = CreateChildInputSchema.safeParse(payload);
    if (!validation.success) {
      setFieldErrors(extractZodFieldErrors(validation.error));
      return;
    }

    setLoading(true);
    try {
      await createChild(validation.data);
      // Al guardar los datos del menor, redirige a la pantalla de inicio del cuidador
      router.replace(APP_ROUTES.CAREGIVER.HOME as never);
    } catch (err) {
      setGeneralError(formatAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Botón superior Volver */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Volver a la pantalla anterior"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backButtonText}>Volver</Text>
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
        <Text style={styles.screenTitle}>Registrar niño</Text>
        <Text style={styles.screenSubtitle}>
          Ingresa los datos de tu hijo o hija para realizar el seguimiento de su crecimiento con los
          patrones oficiales de la OMS.
        </Text>

        {generalError && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={PALETTE.feedback.error} />
            <Text style={styles.errorBoxText}>{generalError}</Text>
          </View>
        )}

        <View style={styles.formContainer}>
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
              placeholder="Ej: Mateo"
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => lastNameRef.current?.focus()}
              blurOnSubmit={false}
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
              ref={lastNameRef}
              style={[styles.input, fieldErrors['lastName'] ? styles.inputError : undefined]}
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                if (fieldErrors['lastName']) {
                  setFieldErrors((prev) => ({ ...prev, lastName: '' }));
                }
              }}
              placeholder="Ej: Rodríguez"
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => dayRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading}
            />
            {fieldErrors['lastName'] ? (
              <Text style={styles.errorText}>{fieldErrors['lastName']}</Text>
            ) : null}
          </View>

          {/* Sexo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sexo biológico</Text>
            <View style={styles.sexRow}>
              <Pressable
                style={[styles.sexChip, sex === 'MALE' ? styles.sexChipSelected : undefined]}
                onPress={() => setSex('MALE')}
                accessibilityRole="button"
                accessibilityLabel="Seleccionar sexo niño"
              >
                <Ionicons
                  name="male"
                  size={18}
                  color={sex === 'MALE' ? '#FFFFFF' : PALETTE.text.title}
                />
                <Text
                  style={[
                    styles.sexChipText,
                    sex === 'MALE' ? styles.sexChipTextSelected : undefined,
                  ]}
                >
                  Niño
                </Text>
              </Pressable>

              <Pressable
                style={[styles.sexChip, sex === 'FEMALE' ? styles.sexChipSelected : undefined]}
                onPress={() => setSex('FEMALE')}
                accessibilityRole="button"
                accessibilityLabel="Seleccionar sexo niña"
              >
                <Ionicons
                  name="female"
                  size={18}
                  color={sex === 'FEMALE' ? '#FFFFFF' : PALETTE.text.title}
                />
                <Text
                  style={[
                    styles.sexChipText,
                    sex === 'FEMALE' ? styles.sexChipTextSelected : undefined,
                  ]}
                >
                  Niña
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Fecha de nacimiento */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <Text style={styles.helperText}>
              Acepta niños de {MIN_CHILD_AGE_MONTHS} a {MAX_CHILD_AGE_MONTHS} meses (1 a 5 años).
            </Text>

            <View style={styles.dateInputsRow}>
              <View style={styles.dateColSmall}>
                <Text style={styles.subLabel}>Día</Text>
                <TextInput
                  ref={dayRef}
                  style={[
                    styles.dateInput,
                    fieldErrors['birthDate'] ? styles.inputError : undefined,
                  ]}
                  value={birthDay}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, '').slice(0, 2);
                    setBirthDay(clean);
                    if (clean.length === 2) monthRef.current?.focus();
                  }}
                  placeholder="DD"
                  placeholderTextColor={PALETTE.input.placeholder}
                  keyboardType="number-pad"
                  maxLength={2}
                  editable={!loading}
                />
              </View>

              <View style={styles.dateColSmall}>
                <Text style={styles.subLabel}>Mes</Text>
                <TextInput
                  ref={monthRef}
                  style={[
                    styles.dateInput,
                    fieldErrors['birthDate'] ? styles.inputError : undefined,
                  ]}
                  value={birthMonth}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, '').slice(0, 2);
                    setBirthMonth(clean);
                    if (clean.length === 2) yearRef.current?.focus();
                  }}
                  placeholder="MM"
                  placeholderTextColor={PALETTE.input.placeholder}
                  keyboardType="number-pad"
                  maxLength={2}
                  editable={!loading}
                />
              </View>

              <View style={styles.dateColLarge}>
                <Text style={styles.subLabel}>Año</Text>
                <TextInput
                  ref={yearRef}
                  style={[
                    styles.dateInput,
                    fieldErrors['birthDate'] ? styles.inputError : undefined,
                  ]}
                  value={birthYear}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, '').slice(0, 4);
                    setBirthYear(clean);
                  }}
                  placeholder="AAAA"
                  placeholderTextColor={PALETTE.input.placeholder}
                  keyboardType="number-pad"
                  maxLength={4}
                  editable={!loading}
                />
              </View>
            </View>

            {fieldErrors['birthDate'] ? (
              <Text style={styles.errorText}>{fieldErrors['birthDate']}</Text>
            ) : null}

            {calculatedMonths !== null && calculatedMonths >= 0 && (
              <View
                style={[
                  styles.ageBadge,
                  calculatedMonths >= MIN_CHILD_AGE_MONTHS &&
                  calculatedMonths <= MAX_CHILD_AGE_MONTHS
                    ? styles.ageBadgeValid
                    : styles.ageBadgeWarning,
                ]}
              >
                <Ionicons
                  name={
                    calculatedMonths >= MIN_CHILD_AGE_MONTHS &&
                    calculatedMonths <= MAX_CHILD_AGE_MONTHS
                      ? 'checkmark-circle'
                      : 'alert-circle'
                  }
                  size={16}
                  color={
                    calculatedMonths >= MIN_CHILD_AGE_MONTHS &&
                    calculatedMonths <= MAX_CHILD_AGE_MONTHS
                      ? PALETTE.primary
                      : PALETTE.feedback.warning
                  }
                />
                <Text style={styles.ageBadgeText}>
                  Edad calculada: {calculatedMonths} meses ({Math.floor(calculatedMonths / 12)} años
                  y {calculatedMonths % 12} meses)
                </Text>
              </View>
            )}
          </View>

          {/* Parentesco */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tu parentesco con el niño/a</Text>
            <View style={styles.relationshipRow}>
              {RELATIONSHIP_OPTIONS.map((rel) => (
                <Pressable
                  key={rel}
                  style={[
                    styles.relationshipChip,
                    relationship === rel ? styles.relationshipChipSelected : undefined,
                  ]}
                  onPress={() => setRelationship(rel)}
                  accessibilityRole="button"
                  accessibilityLabel={`Parentesco ${rel}`}
                >
                  <Text
                    style={[
                      styles.relationshipChipText,
                      relationship === rel ? styles.relationshipChipTextSelected : undefined,
                    ]}
                  >
                    {rel}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Confirmación de representante legal */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setIsLegalRepresentative((prev) => !prev)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isLegalRepresentative }}
            accessibilityLabel="Soy el representante legal del niño"
          >
            <View
              style={[
                styles.checkboxBox,
                isLegalRepresentative ? styles.checkboxBoxChecked : undefined,
              ]}
            >
              {isLegalRepresentative && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <Text style={styles.checkboxLabel}>
              Declaro que soy el representante legal del niño/a para autorizar su registro y
              tratamiento de datos nutricionales.
            </Text>
          </Pressable>
          {fieldErrors['isLegalRepresentative'] ? (
            <Text style={styles.errorText}>{fieldErrors['isLegalRepresentative']}</Text>
          ) : null}

          {/* Botón Guardar */}
          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
            onPress={() => void handleSubmit()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Guardar niño"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Guardar niño</Text>
            )}
          </Pressable>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 6,
  },
  screenSubtitle: {
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
    marginBottom: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBoxText: {
    flex: 1,
    color: PALETTE.feedback.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  formContainer: {
    gap: 18,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.text.body,
    marginBottom: 4,
  },
  helperText: {
    fontSize: 12,
    color: PALETTE.text.body,
    marginBottom: 4,
  },
  input: {
    height: 50,
    backgroundColor: PALETTE.surface,
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: PALETTE.text.title,
  },
  inputError: {
    borderColor: PALETTE.feedback.error,
  },
  errorText: {
    fontSize: 12,
    color: PALETTE.feedback.error,
    fontWeight: '500',
    marginTop: 2,
  },
  sexRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sexChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
  },
  sexChipSelected: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  sexChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  sexChipTextSelected: {
    color: '#FFFFFF',
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateColSmall: {
    flex: 1,
  },
  dateColLarge: {
    flex: 1.5,
  },
  dateInput: {
    height: 50,
    backgroundColor: PALETTE.surface,
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
    borderRadius: 14,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  ageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  ageBadgeValid: {
    backgroundColor: PALETTE.primaryLight,
  },
  ageBadgeWarning: {
    backgroundColor: PALETTE.feedback.warningBg,
  },
  ageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  relationshipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  relationshipChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: PALETTE.surface,
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
  },
  relationshipChipSelected: {
    backgroundColor: PALETTE.secondary,
    borderColor: PALETTE.secondary,
  },
  relationshipChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  relationshipChipTextSelected: {
    color: '#FFFFFF',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: PALETTE.border.default,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
  },
  submitButton: {
    height: 52,
    backgroundColor: PALETTE.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
