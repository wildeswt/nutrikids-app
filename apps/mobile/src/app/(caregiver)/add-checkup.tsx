import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '../../components/ui/DatePicker.js';
import {
  CHECKUP_NOTES_MAX,
  PLAUSIBLE_LENGTH_HEIGHT_MAX_CM,
  PLAUSIBLE_LENGTH_HEIGHT_MIN_CM,
  PLAUSIBLE_WEIGHT_MAX_KG,
  PLAUSIBLE_WEIGHT_MIN_KG,
  type Position,
} from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { ChildBanner } from '../../components/ChildBanner.js';
import { SelectChildModal } from '../../components/SelectChildModal.js';
import { PillField } from '../../components/ui/PillField.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useCheckups } from '../../hooks/useCheckups.js';
import { useClearParamsOnBlur } from '../../hooks/useClearParamsOnBlur.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatDecimal, formatLongDate } from '../../i18n/format.js';
import { correctChildCheckup, isConsentRequiredError } from '../../lib/checkups-api.js';
import {
  buildCreateCheckupInput,
  calculateLocalWhoResults,
  formatDateInput,
  measuredAtFromIsoDate,
  parseDateInput,
  parseDecimalInput,
  type CheckupFormError,
} from '../../lib/checkup-form.js';
import { toCheckupSavedParams, type CheckupRoleMode } from '../../lib/checkup-route.js';
import { formatChildAge } from '../../lib/children-api.js';
import { generateUuid } from '../../lib/uuid.js';

const POSITION_OPTIONS: Position[] = ['STANDING', 'RECUMBENT'];

/** Parses `YYYY-MM-DD` as a local calendar date so the native picker opens on the right day. */
function isoToLocalDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export default function AddCheckupScreen({
  roleMode = 'CAREGIVER',
}: { roleMode?: CheckupRoleMode } = {}) {
  const isProfessional = roleMode === 'PROFESSIONAL';
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'professional', 'common']);
  const params = useLocalSearchParams<{
    childId?: string;
    /** Correction mode: the checkup being replaced and its current values (prefill). */
    correctsCheckupId?: string;
    measuredAt?: string;
    weightKg?: string;
    heightCm?: string;
    position?: string;
    notes?: string;
    /** Where «Volver» goes after correcting: `checkup-history` or, by default, the previous screen. */
    returnTo?: string;
  }>();
  const correctsCheckupId = params.correctsCheckupId ?? null;
  // Leaving the screen ends correction mode (tabs remember their params).
  useClearParamsOnBlur([
    'returnTo',
    'correctsCheckupId',
    'measuredAt',
    'weightKg',
    'heightCm',
    'position',
    'notes',
  ]);

  const {
    status: childrenStatus,
    children,
    error: childrenError,
    loadError: childrenLoadError,
    load: loadChildren,
  } = useChildren();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(params.childId ?? null);
  const activeChild = children.find((child) => child.id === selectedChildId) ?? children[0] ?? null;
  const { create, saving } = useCheckups(activeChild?.id ?? null, { autoLoad: false });

  const [measuredDateText, setMeasuredDateText] = useState(() =>
    formatDateInput(params.measuredAt ? new Date(params.measuredAt) : new Date()),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [position, setPosition] = useState<Position>(
    params.position === 'RECUMBENT' ? 'RECUMBENT' : 'STANDING',
  );
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [weightText, setWeightText] = useState(params.weightKg ?? '');
  const [heightText, setHeightText] = useState(params.heightCm ?? '');
  const [observations, setObservations] = useState(params.notes ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outlierWarning, setOutlierWarning] = useState<string | null>(null);
  const [confirmedOutlier, setConfirmedOutlier] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  /** Same id for every retry of the same data, so a lost response never duplicates the checkup. */
  const attemptId = useRef<string | null>(null);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // The tabs keep their screens mounted: when the screen is shown with other params (correcting
  // another checkup, or back to a new one) the form starts again from them.
  const lastParamsKey = useRef<string | null>(null);
  const paramsKey = [
    params.childId,
    params.correctsCheckupId,
    params.measuredAt,
    params.weightKg,
    params.heightCm,
    params.position,
    params.notes,
  ].join('|');
  useFocusEffect(
    useCallback(() => {
      if (paramsKey === lastParamsKey.current) return;
      lastParamsKey.current = paramsKey;
      setSelectedChildId(params.childId ?? null);
      setMeasuredDateText(
        formatDateInput(params.measuredAt ? new Date(params.measuredAt) : new Date()),
      );
      setPosition(params.position === 'RECUMBENT' ? 'RECUMBENT' : 'STANDING');
      setWeightText(params.weightKg ?? '');
      setHeightText(params.heightCm ?? '');
      setObservations(params.notes ?? '');
      attemptId.current = null;
      setErrorMessage(null);
      setOutlierWarning(null);
      setConfirmedOutlier(false);
      setConsentRequired(false);
    }, [
      paramsKey,
      params.childId,
      params.measuredAt,
      params.position,
      params.weightKg,
      params.heightCm,
      params.notes,
    ]),
  );

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
      case 'notesTooLong':
        return t('addCheckup.errors.notesTooLong', { max: error.max });
      case 'dateInvalid':
        return t('addCheckup.errors.dateInvalid', { example: formatDateInput(new Date()) });
      case 'outlier':
        return t(`addCheckup.errors.outlier_${error.field}`, {
          value: error.value,
          weightMin: PLAUSIBLE_WEIGHT_MIN_KG,
          weightMax: PLAUSIBLE_WEIGHT_MAX_KG,
          heightMin: PLAUSIBLE_LENGTH_HEIGHT_MIN_CM,
          heightMax: PLAUSIBLE_LENGTH_HEIGHT_MAX_CM,
        });
      default:
        return t(`addCheckup.errors.${error.code}`);
    }
  };

  const handleBack = () => {
    // Correcting a checkup always returns to the history it was opened from.
    if (correctsCheckupId && params.returnTo === 'checkup-history') {
      router.navigate({
        pathname: (isProfessional
          ? APP_ROUTES.PROFESSIONAL.CHECKUP_HISTORY
          : APP_ROUTES.CAREGIVER.CHECKUP_HISTORY) as never,
        params: activeChild ? { childId: activeChild.id } : {},
      });
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(
        (isProfessional ? APP_ROUTES.PROFESSIONAL.CHILDREN : APP_ROUTES.CAREGIVER.HOME) as never,
      );
    }
  };

  const handleSwitchPatient = () => {
    if (!activeChild || children.length < 2) return;
    setSelectModalVisible(true);
  };

  const handleSelectChild = (child: (typeof children)[number]) => {
    setSelectedChildId(child.id);
    resetAttempt();
    setSelectModalVisible(false);
  };

  const handleGoToConsent = () => {
    if (!activeChild) return;
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { childId: activeChild.id, childName: activeChild.firstName, mode: 'view' },
    });
  };

  const handleSaveAndCalculate = async () => {
    if (!activeChild || saving || correcting) return;
    setErrorMessage(null);
    setConsentRequired(false);

    attemptId.current ??= generateUuid();
    const result = buildCreateCheckupInput(
      {
        dateText: measuredDateText,
        weightText,
        heightText,
        position,
        notesText: observations,
      },
      {
        birthDate: activeChild.birthDate,
        sex: activeChild.sex,
        confirmOutlier: confirmedOutlier,
        id: attemptId.current,
      },
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
      if (correctsCheckupId) {
        // Correction: needs a connection; the server stores a new checkup that replaces the old one.
        setCorrecting(true);
        try {
          await correctChildCheckup(correctsCheckupId, result.input);
        } finally {
          setCorrecting(false);
        }
        attemptId.current = null;
        handleBack();
        return;
      }
      const checkup = await create(result.input);
      attemptId.current = null;
      // Back from «Control guardado» must not show the saved data again (it could be re-sent).
      setMeasuredDateText(formatDateInput(new Date()));
      setWeightText('');
      setHeightText('');
      setObservations('');
      setPosition('STANDING');
      setOutlierWarning(null);
      setConfirmedOutlier(false);
      router.push({
        pathname: (isProfessional
          ? APP_ROUTES.PROFESSIONAL.CHECKUP_SAVED
          : APP_ROUTES.CAREGIVER.CHECKUP_SAVED) as never,
        params: toCheckupSavedParams(activeChild, checkup, {
          localEvaluation: result.localEvaluation,
          roleMode,
        }),
      });
    } catch (err) {
      if (isConsentRequiredError(err)) {
        setConsentRequired(true);
      } else {
        setErrorMessage(err instanceof Error ? err.message : t('addCheckup.errors.invalid'));
      }
    }
  };

  const handleDatePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }
    setMeasuredDateText(formatDateInput(selectedDate));
    resetAttempt();
  };

  const parsedIsoDate = parseDateInput(measuredDateText);
  const datePickerValue = (parsedIsoDate ? isoToLocalDate(parsedIsoDate) : null) ?? new Date();
  const minBirthDate = activeChild
    ? (isoToLocalDate(activeChild.birthDate) ?? undefined)
    : undefined;

  const liveLocalEvaluation = (() => {
    if (!activeChild || !parsedIsoDate) return null;
    const weightKg = parseDecimalInput(weightText);
    const lengthHeightCm = parseDecimalInput(heightText);
    if (!Number.isFinite(weightKg) || !Number.isFinite(lengthHeightCm)) return null;
    if (weightKg <= 0 || lengthHeightCm <= 0) return null;
    return calculateLocalWhoResults({
      sex: activeChild.sex,
      birthDate: activeChild.birthDate,
      measuredAt: measuredAtFromIsoDate(parsedIsoDate),
      weightKg,
      lengthHeightCm,
      position,
    });
  })();

  const isLoadingChildren = childrenStatus === 'idle' || childrenStatus === 'loading';

  const header = (
    <ScreenHeader
      title={
        correctsCheckupId
          ? t('checkupActions.correctTitle')
          : isProfessional
            ? t('professional:addCheckup.title')
            : t('addCheckup.title')
      }
      backLabel={t('addCheckup.back')}
      onBack={handleBack}
      style={styles.header}
      testID="add-checkup-header"
    />
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
          ) : childrenStatus === 'error' && childrenLoadError === 'needs-connection' ? (
            <View style={styles.stateBox} testID="add-checkup-needs-connection">
              <Ionicons name="cloud-offline-outline" size={32} color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('common:offline.noDataMessage')}</Text>
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
              <Text style={styles.stateTitle}>
                {isProfessional
                  ? t('professional:addCheckup.emptyTitle')
                  : t('addCheckup.emptyTitle')}
              </Text>
              <Text style={styles.stateText}>
                {isProfessional
                  ? t('professional:addCheckup.emptySubtitle')
                  : t('addCheckup.emptySubtitle')}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() =>
                  isProfessional
                    ? router.replace(APP_ROUTES.PROFESSIONAL.CHILDREN as never)
                    : router.push({
                        pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
                        params: { mode: 'register' },
                      })
                }
                accessibilityRole="button"
                accessibilityLabel={
                  isProfessional
                    ? t('professional:addCheckup.goBackToPatients')
                    : t('addCheckup.addChild')
                }
                testID="add-checkup-add-child"
              >
                <Text style={styles.stateButtonText}>
                  {isProfessional
                    ? t('professional:addCheckup.goBackToPatients')
                    : t('addCheckup.addChild')}
                </Text>
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

        {/* Banner naranja del paciente activo con Ver historial adentro */}
        <ChildBanner
          name={`${activeChild.firstName} ${activeChild.lastName}`}
          subtitle={t('addCheckup.childSubtitle', {
            age: formatChildAge(activeChild.birthDate),
            birthDate: formatLongDate(activeChild.birthDate),
          })}
        >
          {!correctsCheckupId ? (
            <View style={styles.bannerActionsRow}>
              <Pressable
                style={({ pressed }) => [styles.bannerActionBtn, pressed && styles.pressed]}
                onPress={() =>
                  router.push({
                    pathname: (isProfessional
                      ? APP_ROUTES.PROFESSIONAL.CHECKUP_HISTORY
                      : APP_ROUTES.CAREGIVER.CHECKUP_HISTORY) as never,
                    params: { childId: activeChild.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('addCheckup.seeHistory')}
                testID="checkup-see-history"
              >
                <Ionicons name="time-outline" size={15} color="#FFFFFF" />
                <Text style={styles.bannerActionText}>{t('addCheckup.seeHistory')}</Text>
              </Pressable>
            </View>
          ) : null}
        </ChildBanner>

        {/* Enlace Cambiar paciente (solo con más de un niño y fuera de corrección) */}
        {children.length > 1 && !correctsCheckupId ? (
          <View style={styles.changePatientRow}>
            <Pressable
              style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
              onPress={handleSwitchPatient}
              accessibilityRole="button"
              accessibilityLabel={
                isProfessional
                  ? t('professional:addCheckup.changePatient')
                  : t('addCheckup.changeChild')
              }
              testID="change-child-button"
            >
              <Text style={styles.changePatientText}>
                {isProfessional
                  ? t('professional:addCheckup.changePatient')
                  : t('addCheckup.changeChild')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.bannerBottomSpacer} />
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
          <PillField
            label={t('addCheckup.dateLabel')}
            rightIcon={
              <Pressable
                onPress={() => setShowDatePicker((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={t('addCheckup.openDatePicker')}
                testID="add-checkup-date-picker-button"
                hitSlop={8}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Ionicons name="calendar" size={22} color="#27272A" />
              </Pressable>
            }
            testID="add-checkup-date-field"
          >
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
              testID="add-checkup-date-input"
            />
          </PillField>

          {showDatePicker ? (
            <View style={styles.datePickerWrapper}>
              <DateTimePicker
                value={datePickerValue}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                minimumDate={minBirthDate}
                onChange={handleDatePickerChange}
                testID="add-checkup-date-picker"
              />
              {Platform.OS === 'ios' ? (
                <Pressable
                  onPress={() => setShowDatePicker(false)}
                  accessibilityRole="button"
                  accessibilityLabel={t('addCheckup.closeDatePicker')}
                  testID="add-checkup-date-picker-done"
                  style={({ pressed }) => [styles.datePickerDone, pressed && styles.pressed]}
                >
                  <Text style={styles.datePickerDoneText}>{t('addCheckup.closeDatePicker')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Campo: Posición de medición */}
        <View style={styles.fieldGroup}>
          <PillField label={t('addCheckup.positionLabel')} testID="add-checkup-position-field">
            <Pressable
              style={({ pressed }) => [styles.selectorPressable, pressed && styles.pressed]}
              onPress={() => setShowPositionMenu((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={t('addCheckup.positionLabel')}
              testID="add-checkup-position-button"
            >
              <Text style={styles.selectorValueText}>{selectedPositionLabel}</Text>
              <Ionicons
                name={showPositionMenu ? 'chevron-up' : 'chevron-down'}
                size={22}
                color="#27272A"
              />
            </Pressable>
          </PillField>

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
          <PillField
            label={t('addCheckup.weightLabel')}
            rightIcon={<Text style={styles.measurementUnit}>{t('common:units.kg')}</Text>}
            style={styles.measurementColumn}
            testID="add-checkup-weight-field"
          >
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
              testID="add-checkup-weight-input"
            />
          </PillField>

          <PillField
            label={t('addCheckup.heightLabel')}
            rightIcon={<Text style={styles.measurementUnit}>{t('common:units.cm')}</Text>}
            style={styles.measurementColumn}
            testID="add-checkup-height-field"
          >
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
              testID="add-checkup-height-input"
            />
          </PillField>
        </View>

        {/* Campo: Observaciones */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('addCheckup.notesLabel')}</Text>
          <View style={styles.observationsContainer}>
            <KeyboardAwareTextInput
              style={styles.observationsInput}
              value={observations}
              onChangeText={(val) => {
                setObservations(val);
                resetAttempt();
              }}
              maxLength={CHECKUP_NOTES_MAX}
              placeholder={t('addCheckup.notesPlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              accessibilityLabel={t('addCheckup.notesLabel')}
            />
          </View>
          <Text style={styles.notesCounter}>
            {t('addCheckup.notesCounter', {
              count: observations.length,
              max: CHECKUP_NOTES_MAX,
            })}
          </Text>
        </View>

        {/* Resultado preliminar calculado localmente con who-growth */}
        {liveLocalEvaluation ? (
          <View
            style={[
              styles.localResultCard,
              liveLocalEvaluation.hasAlert && styles.localResultCardAlert,
            ]}
            testID="add-checkup-local-result"
          >
            <View style={styles.localResultHeader}>
              <Ionicons
                name={liveLocalEvaluation.hasAlert ? 'alert-circle-outline' : 'analytics-outline'}
                size={18}
                color={liveLocalEvaluation.hasAlert ? PALETTE.secondary : PALETTE.primary}
              />
              <Text style={styles.localResultTitle}>
                {isProfessional
                  ? t('professional:addCheckup.localResultTitle')
                  : t('addCheckup.localPreviewTitle')}
              </Text>
            </View>
            {isProfessional ? (
              <View style={styles.localResultRows}>
                <Text style={styles.localResultSummary}>
                  {liveLocalEvaluation.hasAlert
                    ? t('professional:addCheckup.localSummaryAlert', {
                        risk: t(
                          `professional:children.classifications.${liveLocalEvaluation.primary}`,
                        ),
                      })
                    : t('professional:addCheckup.localSummaryNormal')}
                </Text>
                {liveLocalEvaluation.results.map((item) => (
                  <View key={item.indicator} style={styles.localIndicatorRow}>
                    <Text style={styles.localIndicatorName}>
                      {t(`professional:alerts.indicator.${item.indicator}`)}
                    </Text>
                    <Text style={styles.localIndicatorMetrics}>
                      {t('professional:addCheckup.zScoreValue', {
                        value: formatDecimal(item.zScore, 2),
                      })}{' '}
                      ·{' '}
                      {t('professional:addCheckup.percentileValue', {
                        value: formatDecimal(item.percentile, 0),
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.localResultSummary}>
                {liveLocalEvaluation.hasAlert
                  ? t('addCheckup.localPreviewAlert')
                  : t('addCheckup.localPreviewNormal')}
              </Text>
            )}
          </View>
        ) : null}

        {/* Botón Guardar y calcular */}
        <PrimaryButton
          label={saving || correcting ? t('addCheckup.saving') : t('addCheckup.submit')}
          onPress={() => void handleSaveAndCalculate()}
          loading={saving || correcting}
          disabled={saving || correcting}
          accessibilityLabel={t('addCheckup.submit')}
          testID="submit-checkup-button"
          style={styles.submitButton}
        />
      </KeyboardAwareScrollView>

      {activeChild ? (
        <SelectChildModal
          visible={selectModalVisible}
          childrenList={children}
          selectedChildId={activeChild.id}
          onSelect={handleSelectChild}
          onClose={() => setSelectModalVisible(false)}
          isProfessional={isProfessional}
          testID="select-child-modal"
        />
      ) : null}
    </SafeAreaView>
  );
}

export const CheckupFormContent = AddCheckupScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 18,
  },
  bannerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  bannerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: RADIUS_PILL,
  },
  bannerActionText: {
    fontFamily: font('semibold'),
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  changePatientRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    marginBottom: 16,
  },
  bannerBottomSpacer: {
    height: 16,
  },
  linkButton: {
    paddingVertical: 2,
  },
  changePatientText: {
    fontFamily: font('semibold'),
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
    fontFamily: font('semibold'),
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
    fontFamily: font('semibold'),
    color: PALETTE.feedback.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  fieldGroup: {
    marginBottom: 22,
  },
  fieldLabel: {
    fontFamily: font('medium'),
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
    marginBottom: 8,
  },
  pillTextInput: {
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
    paddingVertical: 0,
  },
  datePickerWrapper: {
    marginTop: 8,
    backgroundColor: PALETTE.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    overflow: 'hidden',
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  datePickerDoneText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  selectorPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  selectorValueText: {
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
  },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: PALETTE.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
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
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
  },
  dropdownOptionTextSelected: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
  },
  measurementsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 22,
  },
  measurementColumn: {
    flex: 1,
  },
  measurementInput: {
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
    paddingVertical: 0,
  },
  measurementUnit: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.muted,
  },
  observationsContainer: {
    backgroundColor: PALETTE.input.background,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 124,
  },
  observationsInput: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    minHeight: 96,
  },
  notesCounter: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'right',
    paddingRight: 8,
    marginTop: 6,
  },
  submitButton: {
    marginTop: 10,
  },
  localResultCard: {
    backgroundColor: '#EDF6F4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C5DFDA',
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  localResultCardAlert: {
    backgroundColor: '#FEF2EC',
    borderColor: '#FAD1BF',
  },
  localResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  localResultTitle: {
    fontFamily: font('semibold'),
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  localResultSummary: {
    fontFamily: font('regular'),
    fontSize: 13,
    lineHeight: 18,
    color: PALETTE.text.body,
  },
  localResultRows: {
    gap: 6,
  },
  localIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  localIndicatorName: {
    fontFamily: font('medium'),
    fontSize: 12,
    fontWeight: '500',
    color: PALETTE.text.title,
    flex: 1,
  },
  localIndicatorMetrics: {
    fontFamily: font('semibold'),
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.primary,
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
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 13,
    fontWeight: '600',
  },
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  stateTitle: {
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: {
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
