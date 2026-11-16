import { Ionicons } from '@expo/vector-icons';
import { USER_REMINDER_TYPES } from '@nutrikids/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { PillField } from '../../components/ui/PillField.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useReminders } from '../../hooks/useReminders.js';
import { formatDateInput } from '../../lib/checkup-form.js';
import {
  buildCreateReminderInput,
  formatTimeInput,
  type ReminderFormError,
  type UserReminderType,
} from '../../lib/reminder-form.js';
import { isReminderConsentError } from '../../lib/reminders-api.js';
import { generateUuid } from '../../lib/uuid.js';

/** Suggested date and time: tomorrow at 09:00 (reminders must be in the future). */
function defaultSchedule(): { date: string; time: string } {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return { date: formatDateInput(tomorrow), time: formatTimeInput(tomorrow) };
}

export default function AddReminderScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const params = useLocalSearchParams<{ childId?: string }>();

  const {
    status: childrenStatus,
    children,
    error: childrenError,
    load: loadChildren,
  } = useChildren();
  const { create } = useReminders();

  const [selectedChildId, setSelectedChildId] = useState<string | null>(params.childId ?? null);
  const [type, setType] = useState<UserReminderType>('checkup');
  const [dateText, setDateText] = useState(() => defaultSchedule().date);
  const [timeText, setTimeText] = useState(() => defaultSchedule().time);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);
  /** Same id for every retry of the same data, so a lost response never duplicates the reminder. */
  const attemptId = useRef<string | null>(null);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  const activeChild = children.find((child) => child.id === selectedChildId) ?? children[0] ?? null;

  /** Any change to the data starts a new attempt and clears the previous messages. */
  const resetAttempt = () => {
    attemptId.current = null;
    setErrorMessage(null);
    setConsentRequired(false);
  };

  const formErrorMessage = (error: ReminderFormError): string =>
    error.code === 'dateInvalid'
      ? t('addReminder.errors.dateInvalid', { example: formatDateInput(new Date()) })
      : t(`addReminder.errors.${error.code}`);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.REMINDERS);
    }
  };

  const handleSubmit = async () => {
    if (!activeChild || saving) return;
    setErrorMessage(null);
    setConsentRequired(false);

    attemptId.current ??= generateUuid();
    const result = buildCreateReminderInput(
      { childId: activeChild.id, type, dateText, timeText },
      { id: attemptId.current },
    );
    if (!result.ok) {
      setErrorMessage(formErrorMessage(result.error));
      return;
    }

    setSaving(true);
    try {
      await create(result.input);
      attemptId.current = null;
      router.replace({
        pathname: APP_ROUTES.CAREGIVER.REMINDERS as never,
        params: { childId: activeChild.id },
      });
    } catch (err) {
      if (isReminderConsentError(err)) {
        setConsentRequired(true);
      } else {
        setErrorMessage(err instanceof Error ? err.message : t('addReminder.errors.invalid'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGoToConsent = () => {
    if (!activeChild) return;
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { childId: activeChild.id, childName: activeChild.firstName, mode: 'view' },
    });
  };

  const header = (
    <ScreenHeader
      title={t('addReminder.title')}
      backLabel={t('addReminder.back')}
      onBack={handleBack}
      style={styles.header}
      testID="add-reminder-header"
    />
  );

  if (!activeChild) {
    const loading = childrenStatus === 'idle' || childrenStatus === 'loading';
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.scrollContent}>
          {header}
          {loading ? (
            <View style={styles.stateBox} testID="add-reminder-loading">
              <ActivityIndicator color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('addReminder.loading')}</Text>
            </View>
          ) : childrenStatus === 'error' ? (
            <View style={styles.stateBox} testID="add-reminder-error">
              <Text style={styles.stateText}>{childrenError ?? t('addReminder.loadError')}</Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() => void loadChildren()}
                accessibilityRole="button"
                accessibilityLabel={t('addReminder.retry')}
                testID="add-reminder-retry"
              >
                <Text style={styles.stateButtonText}>{t('addReminder.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stateBox} testID="add-reminder-empty">
              <Text style={styles.stateTitle}>{t('addReminder.emptyTitle')}</Text>
              <Text style={styles.stateText}>{t('addReminder.emptySubtitle')}</Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() =>
                  router.push({
                    pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
                    params: { mode: 'register' },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('addReminder.addChild')}
                testID="add-reminder-add-child"
              >
                <Text style={styles.stateButtonText}>{t('addReminder.addChild')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right', 'bottom']}
      testID="caregiver-add-reminder-screen"
    >
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        {header}

        {errorMessage ? (
          <View style={styles.errorBanner} accessibilityRole="alert" testID="add-reminder-message">
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}

        {consentRequired ? (
          <View style={styles.errorBanner} accessibilityRole="alert" testID="consent-required">
            <Text style={styles.errorBannerText}>
              {t('addReminder.consentRequired', { name: activeChild.firstName })}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.consentButton, pressed && styles.pressed]}
              onPress={handleGoToConsent}
              accessibilityRole="button"
              accessibilityLabel={t('addReminder.goToConsent')}
              testID="go-to-consent-button"
            >
              <Text style={styles.consentButtonText}>{t('addReminder.goToConsent')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Niño: solo se elige cuando hay más de uno */}
        {children.length > 1 ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('addReminder.childLabel')}</Text>
            <View style={styles.chipRow}>
              {children.map((child) => {
                const selected = child.id === activeChild.id;
                return (
                  <Pressable
                    key={child.id}
                    style={[styles.chip, selected && styles.chipSelectedChild]}
                    onPress={() => {
                      setSelectedChildId(child.id);
                      resetAttempt();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    testID={`reminder-child-${child.id}`}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {child.firstName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('addReminder.typeLabel')}</Text>
          <View style={styles.chipRow}>
            {USER_REMINDER_TYPES.map((option) => {
              const selected = option === type;
              return (
                <Pressable
                  key={option}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => {
                    setType(option);
                    resetAttempt();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`reminder-type-${option}`}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {t(`reminders.types.${option}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <PillField
          label={t('addReminder.dateLabel')}
          rightIcon={<Ionicons name="calendar" size={20} color={PALETTE.text.title} />}
          style={styles.fieldGroup}
          testID="add-reminder-date-field"
        >
          <KeyboardAwareTextInput
            style={styles.pillTextInput}
            value={dateText}
            onChangeText={(val) => {
              setDateText(val);
              resetAttempt();
            }}
            keyboardType="numbers-and-punctuation"
            placeholder={t('addReminder.datePlaceholder', {
              example: formatDateInput(new Date()),
            })}
            placeholderTextColor={PALETTE.input.placeholder}
            accessibilityLabel={t('addReminder.dateLabel')}
            testID="reminder-date-input"
          />
        </PillField>

        <View style={styles.fieldGroup}>
          <PillField
            label={t('addReminder.timeLabel')}
            rightIcon={<Ionicons name="time-outline" size={20} color={PALETTE.text.title} />}
            testID="add-reminder-time-field"
          >
            <KeyboardAwareTextInput
              style={styles.pillTextInput}
              value={timeText}
              onChangeText={(val) => {
                setTimeText(val);
                resetAttempt();
              }}
              keyboardType="numbers-and-punctuation"
              placeholder={t('addReminder.timePlaceholder', { example: '09:30' })}
              placeholderTextColor={PALETTE.input.placeholder}
              accessibilityLabel={t('addReminder.timeLabel')}
              testID="reminder-time-input"
            />
          </PillField>
          <Text style={styles.hint}>{t('addReminder.timeHint')}</Text>
        </View>

        <View style={styles.submitWrapper}>
          <PrimaryButton
            label={saving ? t('addReminder.saving') : t('addReminder.submit')}
            onPress={() => void handleSubmit()}
            loading={saving}
            disabled={saving}
            accessibilityLabel={t('addReminder.submit')}
            testID="submit-reminder-button"
          />
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
  scrollContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 36,
  },
  header: {
    paddingHorizontal: 0,
    paddingTop: 0,
    marginBottom: 18,
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
    fontWeight: '600',
    color: PALETTE.feedback.error,
    fontSize: 13,
  },
  fieldGroup: {
    marginBottom: 22,
  },
  fieldLabel: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: PALETTE.input.background,
    borderWidth: 1.5,
    borderColor: PALETTE.border.checkbox,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  chipSelected: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  chipSelectedChild: {
    backgroundColor: PALETTE.secondary,
    borderColor: PALETTE.secondary,
  },
  chipText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    color: PALETTE.text.body,
  },
  chipTextSelected: {
    color: PALETTE.text.light,
  },
  pillTextInput: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    paddingVertical: 0,
  },
  hint: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 6,
    marginLeft: 8,
  },
  submitWrapper: {
    alignItems: 'center',
    marginTop: 10,
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
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 13,
  },
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  stateTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 18,
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  stateButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
