import { Ionicons } from '@expo/vector-icons';
import {
  LENGTH_HEIGHT_MAX_CM,
  LENGTH_HEIGHT_MIN_CM,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  isPlausibleLengthHeight,
  isPlausibleWeight,
  type Position,
} from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { DEMO_CHILDREN, DEMO_NEW_CHECKUP } from '../../constants/demo-data.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useKeyboardBottomInset } from '../../hooks/useKeyboardBottomInset.js';
import { formatAge, formatDecimal, formatLongDate } from '../../i18n/format.js';

const POSITION_OPTIONS: Position[] = ['STANDING', 'RECUMBENT'];

function parseDecimalInput(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  return Number.parseFloat(normalized);
}

export default function AddCheckupScreen() {
  const router = useRouter();
  const keyboardInset = useKeyboardBottomInset();
  const { t } = useTranslation(['caregiver', 'common']);

  const [selectedPatientIndex, setSelectedPatientIndex] = useState(0);
  const [measuredDateText, setMeasuredDateText] = useState(() =>
    formatLongDate(DEMO_NEW_CHECKUP.measuredAt),
  );
  const [position, setPosition] = useState<Position>(DEMO_NEW_CHECKUP.position);
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [weightText, setWeightText] = useState(() => formatDecimal(DEMO_NEW_CHECKUP.weightKg));
  const [heightText, setHeightText] = useState(() => formatDecimal(DEMO_NEW_CHECKUP.heightCm));
  const [observations, setObservations] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outlierWarning, setOutlierWarning] = useState<string | null>(null);
  const [confirmedOutlier, setConfirmedOutlier] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const activePatient = DEMO_CHILDREN[selectedPatientIndex] ?? DEMO_CHILDREN[0]!;
  const selectedPositionLabel = t(`addCheckup.positions.${position}`);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
    }
  };

  const handleSwitchPatient = () => {
    setSelectedPatientIndex((prev) => (prev + 1) % DEMO_CHILDREN.length);
    setErrorMessage(null);
    setOutlierWarning(null);
    setConfirmedOutlier(false);
    setSavedSuccess(false);
  };

  const handleSaveAndCalculate = () => {
    setErrorMessage(null);
    setSavedSuccess(false);

    const weightKg = parseDecimalInput(weightText);
    const lengthHeightCm = parseDecimalInput(heightText);

    if (!measuredDateText.trim()) {
      setErrorMessage(t('addCheckup.errors.dateRequired'));
      return;
    }

    if (Number.isNaN(weightKg) || weightKg < WEIGHT_MIN_KG || weightKg > WEIGHT_MAX_KG) {
      setErrorMessage(
        t('addCheckup.errors.weightRange', { min: WEIGHT_MIN_KG, max: WEIGHT_MAX_KG }),
      );
      return;
    }

    if (
      Number.isNaN(lengthHeightCm) ||
      lengthHeightCm < LENGTH_HEIGHT_MIN_CM ||
      lengthHeightCm > LENGTH_HEIGHT_MAX_CM
    ) {
      setErrorMessage(
        t('addCheckup.errors.heightRange', {
          min: LENGTH_HEIGHT_MIN_CM,
          max: LENGTH_HEIGHT_MAX_CM,
        }),
      );
      return;
    }

    const weightPlausible = isPlausibleWeight(weightKg);
    const heightPlausible = isPlausibleLengthHeight(lengthHeightCm);

    if ((!weightPlausible || !heightPlausible) && !confirmedOutlier) {
      setOutlierWarning(t('addCheckup.errors.outlier'));
      setConfirmedOutlier(true);
      return;
    }

    setOutlierWarning(null);
    setConfirmedOutlier(false);
    setSavedSuccess(true);
    router.push(APP_ROUTES.CAREGIVER.CHECKUP_SAVED);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: keyboardInset > 0 ? keyboardInset + 36 : 36 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Botón superior: <- Volver */}
          <Pressable
            style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t('addCheckup.back')}
          >
            <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
            <Text style={styles.backText}>{t('addCheckup.back')}</Text>
          </Pressable>

          {/* Título principal */}
          <Text style={styles.screenTitle}>{t('addCheckup.title')}</Text>

          {/* Tarjeta naranja del paciente activo */}
          <View style={styles.patientCard}>
            <Text style={styles.patientName}>{activePatient.fullName}</Text>
            <Text style={styles.patientSubtitle}>
              {t('addCheckup.childSubtitle', {
                age: formatAge(activePatient.ageMonths),
                birthDate: formatLongDate(activePatient.birthDate),
              })}
            </Text>
          </View>

          {/* Enlace Cambiar paciente */}
          <Pressable
            style={({ pressed }) => [styles.changePatientButton, pressed && styles.pressed]}
            onPress={handleSwitchPatient}
            accessibilityRole="button"
            accessibilityLabel={t('addCheckup.changeChild')}
          >
            <Text style={styles.changePatientText}>{t('addCheckup.changeChild')}</Text>
          </Pressable>

          {/* Mensajes de error o confirmación de valor atípico */}
          {errorMessage ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          {outlierWarning ? (
            <View style={styles.warningBanner} accessibilityRole="alert">
              <Text style={styles.warningBannerText}>{outlierWarning}</Text>
            </View>
          ) : null}

          {savedSuccess ? (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>{t('addCheckup.saved')}</Text>
            </View>
          ) : null}

          {/* Campo: Fecha del control */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('addCheckup.dateLabel')}</Text>
            <View style={styles.pillInputContainer}>
              <TextInput
                style={styles.pillTextInput}
                value={measuredDateText}
                onChangeText={setMeasuredDateText}
                placeholder={t('addCheckup.datePlaceholder', {
                  example: formatLongDate(DEMO_NEW_CHECKUP.measuredAt),
                })}
                placeholderTextColor={PALETTE.input.placeholder}
                accessibilityLabel={t('addCheckup.dateLabel')}
              />
              <Ionicons name="calendar" size={22} color="#27272A" />
            </View>
          </View>

          {/* Campo: Posición de medición */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('addCheckup.positionLabel')}</Text>
            <Pressable
              style={({ pressed }) => [styles.pillInputContainer, pressed && styles.pressed]}
              onPress={() => setShowPositionMenu((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={t('addCheckup.positionLabel')}
            >
              <Text style={styles.selectorValueText}>{selectedPositionLabel}</Text>
              <Ionicons
                name={showPositionMenu ? 'chevron-up' : 'chevron-down'}
                size={22}
                color="#27272A"
              />
            </Pressable>

            {showPositionMenu ? (
              <View style={styles.dropdownMenu}>
                {POSITION_OPTIONS.map((option) => {
                  const isSelected = option === position;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                      onPress={() => {
                        setPosition(option);
                        setShowPositionMenu(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          isSelected && styles.dropdownOptionTextSelected,
                        ]}
                      >
                        {t(`addCheckup.positions.${option}`)}
                      </Text>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={18} color={PALETTE.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Fila doble: Peso (kg) y Talla (cm) */}
          <View style={styles.measurementsRow}>
            <View style={styles.measurementColumn}>
              <Text style={styles.fieldLabel}>{t('addCheckup.weightLabel')}</Text>
              <View style={styles.measurementBox}>
                <TextInput
                  style={styles.measurementInput}
                  value={weightText}
                  onChangeText={(val) => {
                    setWeightText(val);
                    setConfirmedOutlier(false);
                    setOutlierWarning(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={t('addCheckup.decimalPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  accessibilityLabel={t('addCheckup.weightA11y')}
                />
                <Text style={styles.measurementUnit}>{t('common:units.kg')}</Text>
              </View>
            </View>

            <View style={styles.measurementColumn}>
              <Text style={styles.fieldLabel}>{t('addCheckup.heightLabel')}</Text>
              <View style={styles.measurementBox}>
                <TextInput
                  style={styles.measurementInput}
                  value={heightText}
                  onChangeText={(val) => {
                    setHeightText(val);
                    setConfirmedOutlier(false);
                    setOutlierWarning(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={t('addCheckup.decimalPlaceholder')}
                  placeholderTextColor={PALETTE.input.placeholder}
                  accessibilityLabel={t('addCheckup.heightA11y')}
                />
                <Text style={styles.measurementUnit}>{t('common:units.cm')}</Text>
              </View>
            </View>
          </View>

          {/* Campo: Observaciones */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('addCheckup.notesLabel')}</Text>
            <View style={styles.observationsContainer}>
              <TextInput
                style={styles.observationsInput}
                value={observations}
                onChangeText={setObservations}
                placeholder={t('addCheckup.notesPlaceholder')}
                placeholderTextColor={PALETTE.input.placeholder}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                accessibilityLabel={t('addCheckup.notesLabel')}
              />
            </View>
          </View>

          {/* Botón Guardar y calcular */}
          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={handleSaveAndCalculate}
            accessibilityRole="button"
            accessibilityLabel={t('addCheckup.submit')}
          >
            <Text style={styles.submitButtonText}>{t('addCheckup.submit')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginBottom: 18,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 18,
  },
  patientCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 22,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  patientName: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 3,
  },
  patientSubtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
  },
  changePatientButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 18,
    paddingVertical: 2,
  },
  changePatientText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.primary,
    textDecorationLine: 'underline',
  },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: PALETTE.feedback.error,
    fontSize: 13,
    fontWeight: '600',
  },
  warningBanner: {
    backgroundColor: PALETTE.feedback.warningBg,
    borderColor: PALETTE.feedback.warning,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  warningBannerText: {
    color: PALETTE.feedback.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  successBanner: {
    backgroundColor: PALETTE.feedback.successBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  successBannerText: {
    color: PALETTE.feedback.success,
    fontSize: 13,
    fontWeight: '600',
  },
  fieldGroup: {
    marginBottom: 22,
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 10,
  },
  pillInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7F7F7',
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
    borderRadius: 28,
    paddingHorizontal: 20,
    height: 54,
  },
  pillTextInput: {
    flex: 1,
    fontSize: 16,
    color: PALETTE.text.body,
    paddingVertical: 8,
    marginRight: 10,
  },
  selectorValueText: {
    fontSize: 16,
    color: PALETTE.text.body,
  },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: PALETTE.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  dropdownOptionSelected: {
    backgroundColor: PALETTE.primaryLight,
  },
  dropdownOptionText: {
    fontSize: 15,
    color: PALETTE.text.body,
  },
  dropdownOptionTextSelected: {
    fontWeight: '700',
    color: PALETTE.primary,
  },
  measurementsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 22,
  },
  measurementColumn: {
    flex: 1,
  },
  measurementBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7F7F7',
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
    borderRadius: 26,
    paddingHorizontal: 20,
    height: 70,
  },
  measurementInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: '500',
    color: PALETTE.text.body,
    paddingVertical: 6,
  },
  measurementUnit: {
    fontSize: 17,
    color: PALETTE.text.body,
    marginLeft: 6,
  },
  observationsContainer: {
    backgroundColor: '#F7F7F7',
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 124,
  },
  observationsInput: {
    flex: 1,
    fontSize: 15,
    color: PALETTE.text.body,
    minHeight: 96,
  },
  submitButton: {
    marginTop: 10,
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 18,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  submitButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
