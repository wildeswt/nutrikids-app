import { Ionicons } from '@expo/vector-icons';
import type { Position } from '@nutrikids/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { ChildBanner } from '../../components/ChildBanner.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatLongDate } from '../../i18n/format.js';
import { isConsentRequiredError } from '../../lib/checkups-api.js';
import {
  buildCreateCheckupInput,
  formatDateInput,
  type CheckupFormError,
} from '../../lib/checkup-form.js';
import { toCheckupSavedParams } from '../../lib/checkup-route.js';
import { formatChildAge } from '../../lib/children-api.js';
import { generateUuid } from '../../lib/uuid.js';

const POSITION_OPTIONS: Position[] = ['STANDING', 'RECUMBENT'];

export default function AddCheckupScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const params = useLocalSearchParams<{ childId?: string }>();

  const {
    status: childrenStatus,
    children,
    error: childrenError,
    load: loadChildren,
  } = useChildren();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(params.childId ?? null);
  const activeChild = children.find((child) => child.id === selectedChildId) ?? children[0] ?? null;
  const { create, saving } = useCheckups(activeChild?.id ?? null, { autoLoad: false });

  const [measuredDateText, setMeasuredDateText] = useState(() => formatDateInput(new Date()));
  const [position, setPosition] = useState<Position>('STANDING');
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [weightText, setWeightText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [observations, setObservations] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outlierWarning, setOutlierWarning] = useState<string | null>(null);
  const [confirmedOutlier, setConfirmedOutlier] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  /** Same id for every retry of the same data, so a lost response never duplicates the checkup. */
  const attemptId = useRef<string | null>(null);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  const selectedPositionLabel = t(`addCheckup.positions.${position}`);

  /** Any change to the data starts a new attempt and clears the previous messages. */
  const resetAttempt = () => {
    attemptId.current = null;
    setErrorMessage(null);
    setOutlierWarning(null);
    setConfirmedOutlier(false);
    setConsentRequired(false);
  };

  const formErrorMessage = (error: CheckupFormError): string => {
    switch (error.code) {
      case 'weightRange':
        return t('addCheckup.errors.weightRange', { min: error.min, max: error.max });
      case 'heightRange':
        return t('addCheckup.errors.heightRange', { min: error.min, max: error.max });
      case 'dateInvalid':
        return t('addCheckup.errors.dateInvalid', { example: formatDateInput(new Date()) });
      case 'outlier':
        return t('addCheckup.errors.outlier');
      default:
        return t(`addCheckup.errors.${error.code}`);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
    }
  };

  const handleSwitchPatient = () => {
    if (!activeChild || children.length < 2) return;
    const index = children.findIndex((child) => child.id === activeChild.id);
    setSelectedChildId(children[(index + 1) % children.length]!.id);
    resetAttempt();
  };

  const handleGoToConsent = () => {
    if (!activeChild) return;
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { childId: activeChild.id, childName: activeChild.firstName, mode: 'view' },
    });
  };

  const handleSaveAndCalculate = async () => {
    if (!activeChild || saving) return;
    setErrorMessage(null);
    setConsentRequired(false);

    attemptId.current ??= generateUuid();
    const result = buildCreateCheckupInput(
      { dateText: measuredDateText, weightText, heightText, position },
      { birthDate: activeChild.birthDate, confirmOutlier: confirmedOutlier, id: attemptId.current },
    );

    if (!result.ok) {
      if (result.error.code === 'outlier') {
        // Atypical values: ask once, the next tap sends them with `confirmOutlier`.
        setOutlierWarning(formErrorMessage(result.error));
        setConfirmedOutlier(true);
      } else {
        setErrorMessage(formErrorMessage(result.error));
      }
      return;
    }

    setOutlierWarning(null);

    try {
      const checkup = await create(result.input);
      attemptId.current = null;
      router.push({
        pathname: APP_ROUTES.CAREGIVER.CHECKUP_SAVED as never,
        params: toCheckupSavedParams(activeChild, checkup),
      });
    } catch (err) {
      if (isConsentRequiredError(err)) {
        setConsentRequired(true);
      } else {
        setErrorMessage(err instanceof Error ? err.message : t('addCheckup.errors.invalid'));
      }
    }
  };

  const isLoadingChildren = childrenStatus === 'idle' || childrenStatus === 'loading';

  const header = (
    <>
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
    </>
  );

  if (!activeChild) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.scrollContent}>
          {header}
          {isLoadingChildren ? (
            <View style={styles.stateBox} testID="add-checkup-loading">
              <ActivityIndicator color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('addCheckup.loading')}</Text>
            </View>
          ) : childrenStatus === 'error' ? (
            <View style={styles.stateBox} testID="add-checkup-error">
              <Text style={styles.stateText}>{childrenError ?? t('addCheckup.loadError')}</Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() => void loadChildren()}
                accessibilityRole="button"
                accessibilityLabel={t('addCheckup.retry')}
                testID="add-checkup-retry"
              >
                <Text style={styles.stateButtonText}>{t('addCheckup.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stateBox} testID="add-checkup-empty">
              <Text style={styles.stateTitle}>{t('addCheckup.emptyTitle')}</Text>
              <Text style={styles.stateText}>{t('addCheckup.emptySubtitle')}</Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() =>
                  router.push({
                    pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
                    params: { mode: 'register' },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('addCheckup.addChild')}
                testID="add-checkup-add-child"
              >
                <Text style={styles.stateButtonText}>{t('addCheckup.addChild')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        {header}

        {/* Banner naranja del paciente activo */}
        <ChildBanner
          name={`${activeChild.firstName} ${activeChild.lastName}`}
          subtitle={t('addCheckup.childSubtitle', {
            age: formatChildAge(activeChild.birthDate),
            birthDate: formatLongDate(activeChild.birthDate),
          })}
        />

        {/* Enlace Cambiar paciente (solo con más de un niño) */}
        {children.length > 1 ? (
          <Pressable
            style={({ pressed }) => [styles.changePatientButton, pressed && styles.pressed]}
            onPress={handleSwitchPatient}
            accessibilityRole="button"
            accessibilityLabel={t('addCheckup.changeChild')}
            testID="change-child-button"
          >
            <Text style={styles.changePatientText}>{t('addCheckup.changeChild')}</Text>
          </Pressable>
        ) : (
          <View style={styles.changePatientButton} />
        )}

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

        {consentRequired ? (
          <View style={styles.errorBanner} accessibilityRole="alert" testID="consent-required">
            <Text style={styles.errorBannerText}>
              {t('addCheckup.consentRequired', { name: activeChild.firstName })}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.consentButton, pressed && styles.pressed]}
              onPress={handleGoToConsent}
              accessibilityRole="button"
              accessibilityLabel={t('addCheckup.goToConsent')}
              testID="go-to-consent-button"
            >
              <Text style={styles.consentButtonText}>{t('addCheckup.goToConsent')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Campo: Fecha del control */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('addCheckup.dateLabel')}</Text>
          <View style={styles.pillInputContainer}>
            <KeyboardAwareTextInput
              style={styles.pillTextInput}
              value={measuredDateText}
              onChangeText={(val) => {
                setMeasuredDateText(val);
                resetAttempt();
              }}
              keyboardType="numbers-and-punctuation"
              placeholder={t('addCheckup.datePlaceholder', {
                example: formatDateInput(new Date()),
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
                      resetAttempt();
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
              <KeyboardAwareTextInput
                style={styles.measurementInput}
                value={weightText}
                onChangeText={(val) => {
                  setWeightText(val);
                  resetAttempt();
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
              <KeyboardAwareTextInput
                style={styles.measurementInput}
                value={heightText}
                onChangeText={(val) => {
                  setHeightText(val);
                  resetAttempt();
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
            <KeyboardAwareTextInput
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
          onPress={() => void handleSaveAndCalculate()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t('addCheckup.submit')}
          accessibilityState={{ busy: saving, disabled: saving }}
          testID="submit-checkup-button"
        >
          <Text style={styles.submitButtonText}>
            {saving ? t('addCheckup.saving') : t('addCheckup.submit')}
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
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
  consentButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: PALETTE.feedback.error,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  consentButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
