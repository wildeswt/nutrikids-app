import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { PillField } from '../../components/ui/PillField.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useFollowUpForm } from '../../hooks/useFollowUpForm.js';
import { formatShortDate } from '../../i18n/format.js';
import { formatDateInput } from '../../lib/checkup-form.js';
import { formatChildAge } from '../../lib/children-api.js';
import {
  FOLLOW_UP_TYPES,
  NEXT_CHECKUP_SHORTCUT_DAYS,
  formatNextCheckupLong,
  minNextCheckupDate,
  nextCheckupAfterDays,
  nextCheckupPickerValue,
} from '../../lib/follow-up-form.js';

const MAX_CONTENT_WIDTH = 640;

export default function FollowUpScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();
  const { user } = useAuth();
  const { alertId, childId } = useLocalSearchParams<{ alertId?: string; childId?: string }>();
  const follow = useFollowUpForm({ alertId, childId });
  const { load, form, setForm } = follow;
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.PROFESSIONAL.ALERTS);
  };

  const handleSave = async () => {
    const outcome = await follow.save();
    if (outcome === 'sent' || outcome === 'queued') goBack();
  };

  const handleDatePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }
    setForm({ nextCheckupText: formatDateInput(selectedDate) });
  };

  const header = (
    <ScreenHeader
      title={t('followUp.title')}
      backLabel={t('common:actions.back')}
      onBack={goBack}
      testID="follow-up"
    />
  );

  if (follow.loading || follow.fatalError) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.content} testID="follow-up-screen">
          {header}
          {follow.fatalError ? (
            <View style={styles.centerBox} testID="follow-up-error">
              <Ionicons name="alert-circle" size={48} color={PALETTE.feedback.error} />
              <Text style={styles.errorText}>{follow.fatalError}</Text>
              <Pressable
                style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
                onPress={() => void load()}
                accessibilityRole="button"
                testID="follow-up-retry"
              >
                <Text style={styles.smallButtonText}>{t('followUp.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.centerBox} testID="follow-up-loading">
              <ActivityIndicator size="large" color={PALETTE.primary} />
              <Text style={styles.mutedText}>{t('followUp.loading')}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date();
  const specialty = user?.specialty ? t(`common:specialties.${user.specialty}`) : null;
  const doctor = user ? `${user.firstName} ${user.lastName}` : '';
  const date = `${formatShortDate(now)} ${now.getFullYear()}`;
  const contextLine = specialty
    ? t('followUp.context', { date, name: doctor, specialty })
    : t('followUp.contextNoSpecialty', { date, name: doctor });

  const errorCode = follow.formError?.code;
  const errorMessage = follow.formError
    ? t(`followUp.errors.${follow.formError.code}`, {
        max: follow.formError.code === 'detailsTooLong' ? follow.formError.max : undefined,
      })
    : null;
  const fieldError = (...codes: string[]) =>
    errorCode && codes.includes(errorCode) ? (
      <Text
        style={styles.fieldError}
        accessibilityRole="alert"
        testID={`follow-up-error-${errorCode}`}
      >
        {errorMessage}
      </Text>
    ) : null;

  const hasTypeError = errorCode === 'typeRequired';
  const hasDetailsError = errorCode === 'detailsRequired' || errorCode === 'detailsTooLong';
  const hasDateError = errorCode === 'dateInvalid' || errorCode === 'datePast';
  const longNextCheckup = formatNextCheckupLong(form.nextCheckupText);
  const minDate = minNextCheckupDate();
  const pickerValue = nextCheckupPickerValue(form.nextCheckupText);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="follow-up-screen">
          {header}

          <ChildBanner
            name={
              follow.child
                ? `${follow.child.firstName} ${follow.child.lastName}`
                : t('alertDetail.unknownChild')
            }
            subtitle={
              follow.child
                ? t('followUp.childSubtitle', { age: formatChildAge(follow.child.birthDate) })
                : undefined
            }
          />
          <Text style={styles.contextLine} testID="follow-up-context">
            {contextLine}
          </Text>

          {follow.rejectedReason ? (
            <View style={styles.errorBanner} accessibilityRole="alert" testID="follow-up-rejected">
              <Text style={styles.errorBannerText}>
                {t('followUp.rejected', { reason: follow.rejectedReason })}
              </Text>
            </View>
          ) : null}
          {follow.notice === 'draftRestored' ? (
            <Text style={styles.noticeText} testID="follow-up-draft-restored">
              {t('followUp.draftRestored')}
            </Text>
          ) : null}

          {/* Tipo de seguimiento (un tipo por seguimiento) */}
          <View style={styles.fieldGroup}>
            <PillField
              label={t('followUp.typeLabel')}
              error={hasTypeError}
              testID="follow-up-type-field"
            >
              <Pressable
                style={({ pressed }) => [styles.selectorPressable, pressed && styles.pressed]}
                onPress={() => {
                  setShowTypeMenu((open) => !open);
                  setShowDatePicker(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('followUp.typeLabel')}
                accessibilityState={{ expanded: showTypeMenu }}
                testID="follow-up-type"
              >
                <Text
                  style={form.type ? styles.selectValue : styles.selectPlaceholder}
                  numberOfLines={1}
                >
                  {form.type ? t(`followUp.types.${form.type}`) : t('followUp.typePlaceholder')}
                </Text>
                <Ionicons
                  name={showTypeMenu ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={PALETTE.text.title}
                />
              </Pressable>
            </PillField>
            {showTypeMenu ? (
              <View style={styles.dropdownMenu} testID="follow-up-type-menu">
                {FOLLOW_UP_TYPES.map((type) => {
                  const selected = type === form.type;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.dropdownOption, selected && styles.dropdownOptionSelected]}
                      onPress={() => {
                        setForm({ type });
                        setShowTypeMenu(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      testID={`follow-up-type-${type}`}
                    >
                      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                        {t(`followUp.types.${type}`)}
                      </Text>
                      {selected ? (
                        <Ionicons name="checkmark" size={20} color={PALETTE.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {fieldError('typeRequired')}
          </View>

          {/* Detalle */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('followUp.detailsLabel')}</Text>
            <View style={[styles.textAreaBox, hasDetailsError && styles.textAreaBoxError]}>
              <KeyboardAwareTextInput
                style={styles.textArea}
                value={form.details}
                onChangeText={(details) => setForm({ details })}
                multiline
                textAlignVertical="top"
                placeholder={t(`followUp.detailsPlaceholder.${form.type ?? 'none'}`)}
                placeholderTextColor={PALETTE.input.placeholder}
                accessibilityLabel={t('followUp.detailsLabel')}
                testID="follow-up-details"
              />
            </View>
            {fieldError('detailsRequired', 'detailsTooLong')}
          </View>

          {/* Próximo control */}
          <View style={styles.fieldGroup}>
            <PillField
              label={t('followUp.nextCheckupLabel')}
              error={hasDateError}
              testID="follow-up-next-checkup-field"
              rightIcon={
                <Pressable
                  onPress={() => {
                    setShowDatePicker((open) => !open);
                    setShowTypeMenu(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('followUp.openDatePicker')}
                  testID="follow-up-date-picker-button"
                  hitSlop={8}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Ionicons name="calendar" size={22} color={PALETTE.text.title} />
                </Pressable>
              }
            >
              <Pressable
                style={({ pressed }) => [styles.selectorPressable, pressed && styles.pressed]}
                onPress={() => {
                  setShowDatePicker((open) => !open);
                  setShowTypeMenu(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('followUp.nextCheckupLabel')}
                accessibilityState={{ expanded: showDatePicker }}
                testID="follow-up-next-checkup"
              >
                <Text
                  style={longNextCheckup ? styles.selectValue : styles.selectPlaceholder}
                  numberOfLines={1}
                >
                  {longNextCheckup ?? t('followUp.nextCheckupPlaceholder')}
                </Text>
              </Pressable>
            </PillField>

            {showDatePicker ? (
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={pickerValue}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={minDate}
                  onChange={handleDatePickerChange}
                  testID="follow-up-date-picker"
                />
                {Platform.OS === 'ios' ? (
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t('followUp.closeDatePicker')}
                    testID="follow-up-date-picker-done"
                    style={({ pressed }) => [styles.datePickerDone, pressed && styles.pressed]}
                  >
                    <Text style={styles.datePickerDoneText}>{t('followUp.closeDatePicker')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.chips}>
              {NEXT_CHECKUP_SHORTCUT_DAYS.map((days) => {
                const value = nextCheckupAfterDays(days, now);
                const selected = form.nextCheckupText === value;
                return (
                  <Pressable
                    key={days}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => {
                      setForm({ nextCheckupText: value });
                      setShowDatePicker(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    testID={`follow-up-shortcut-${days}`}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {t(`followUp.nextCheckupShortcuts.${days}`)}
                    </Text>
                  </Pressable>
                );
              })}
              {form.nextCheckupText ? (
                <Pressable
                  style={styles.chip}
                  onPress={() => {
                    setForm({ nextCheckupText: '' });
                    setShowDatePicker(false);
                  }}
                  accessibilityRole="button"
                  testID="follow-up-clear-date"
                >
                  <Text style={styles.chipText}>{t('followUp.nextCheckupClear')}</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.hint}>{t('followUp.nextCheckupHint')}</Text>
            {fieldError('dateInvalid', 'datePast')}
          </View>

          {/* La alerta pasa a «seguimiento establecido» */}
          {follow.canEstablish ? (
            <Pressable
              style={styles.checkRow}
              onPress={() => setForm({ establish: !form.establish })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.establish }}
              testID="follow-up-establish"
            >
              <Ionicons
                name={form.establish ? 'checkbox' : 'square-outline'}
                size={26}
                color={PALETTE.primary}
              />
              <Text style={styles.checkLabel}>{t('followUp.establishLabel')}</Text>
            </Pressable>
          ) : null}

          {follow.offline ? (
            <Text style={styles.offlineText} accessibilityRole="alert" testID="follow-up-offline">
              {t('followUp.offline')}
            </Text>
          ) : null}
          {follow.apiError ? (
            <Text style={styles.fieldError} accessibilityRole="alert" testID="follow-up-api-error">
              {follow.apiError}
            </Text>
          ) : null}
          {fieldError('invalid')}
          {follow.alertNotMoved ? (
            <Text
              style={styles.fieldError}
              accessibilityRole="alert"
              testID="follow-up-alert-not-moved"
            >
              {t('followUp.alertNotMoved', { reason: follow.alertNotMoved })}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              label={follow.saving ? t('followUp.actions.saving') : t('followUp.actions.save')}
              onPress={() => void handleSave()}
              disabled={follow.saving}
              loading={follow.saving}
              testID="follow-up-save"
            />
            <SecondaryButton
              label={t('followUp.actions.saveDraft')}
              onPress={() => void follow.saveAsDraft()}
              disabled={follow.saving}
              testID="follow-up-save-draft"
            />
            {follow.notice === 'draftSaved' ? (
              <Text style={styles.noticeText} testID="follow-up-draft-saved">
                {t('followUp.draftSaved')}
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  scrollContent: { paddingBottom: 32 },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    gap: 16,
  },
  pressed: { opacity: 0.8 },
  contextLine: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontFamily: font('medium'),
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  selectorPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  selectValue: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
  },
  selectPlaceholder: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.input.placeholder,
  },
  dropdownMenu: {
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
  dropdownOptionSelected: { backgroundColor: PALETTE.primaryLight },
  optionText: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
  },
  optionTextSelected: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
  },
  textAreaBox: {
    backgroundColor: PALETTE.input.background,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 124,
  },
  textAreaBoxError: {
    borderColor: PALETTE.feedback.error,
  },
  textArea: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    minHeight: 96,
  },
  datePickerWrapper: {
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
  },
  chipSelected: { backgroundColor: PALETTE.primary, borderColor: PALETTE.primary },
  chipText: {
    fontFamily: font('semibold'),
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  chipTextSelected: { color: PALETTE.text.light },
  hint: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkLabel: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
  },
  offlineText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.secondaryPressed,
  },
  fieldError: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
  noticeText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.primary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
    borderRadius: 16,
    padding: 12,
  },
  errorBannerText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.feedback.error,
  },
  actions: { gap: 12 },
  centerBox: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  mutedText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  smallButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS_PILL,
  },
  smallButtonText: {
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '600',
  },
});
