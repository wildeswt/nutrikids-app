import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { useFollowUpForm } from '../../hooks/useFollowUpForm.js';
import { formatShortDate } from '../../i18n/format.js';
import { formatChildAge } from '../../lib/children-api.js';
import {
  FOLLOW_UP_TYPES,
  NEXT_CHECKUP_SHORTCUT_DAYS,
  nextCheckupAfterDays,
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

  const header = (
    <>
      <Pressable
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        onPress={goBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common:actions.goBack')}
        testID="follow-up-back"
      >
        <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        <Text style={styles.backText}>{t('common:actions.back')}</Text>
      </Pressable>
      <Text style={styles.screenTitle}>{t('followUp.title')}</Text>
    </>
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

          {/* Tipo de seguimiento */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('followUp.typeLabel')}</Text>
            <Pressable
              style={({ pressed }) => [styles.pillInput, pressed && styles.pressed]}
              onPress={() => setShowTypeMenu((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={t('followUp.typeLabel')}
              accessibilityState={{ expanded: showTypeMenu }}
              testID="follow-up-type"
            >
              <Text style={form.type ? styles.selectValue : styles.selectPlaceholder}>
                {form.type ? t(`followUp.types.${form.type}`) : t('followUp.typePlaceholder')}
              </Text>
              <Ionicons
                name={showTypeMenu ? 'chevron-up' : 'chevron-down'}
                size={22}
                color="#27272A"
              />
            </Pressable>
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
            <View style={styles.textAreaBox}>
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
            <Text style={styles.fieldLabel}>{t('followUp.nextCheckupLabel')}</Text>
            <View style={styles.pillInput}>
              <KeyboardAwareTextInput
                style={styles.pillTextInput}
                value={form.nextCheckupText}
                onChangeText={(nextCheckupText) => setForm({ nextCheckupText })}
                keyboardType="numbers-and-punctuation"
                placeholder={t('followUp.nextCheckupPlaceholder')}
                placeholderTextColor={PALETTE.input.placeholder}
                accessibilityLabel={t('followUp.nextCheckupLabel')}
                testID="follow-up-next-checkup"
              />
              <Ionicons name="calendar" size={22} color="#27272A" />
            </View>
            <View style={styles.chips}>
              {NEXT_CHECKUP_SHORTCUT_DAYS.map((days) => {
                const value = nextCheckupAfterDays(days, now);
                const selected = form.nextCheckupText === value;
                return (
                  <Pressable
                    key={days}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setForm({ nextCheckupText: value })}
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
                  onPress={() => setForm({ nextCheckupText: '' })}
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
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || follow.saving) && styles.pressed,
              ]}
              onPress={() => void handleSave()}
              disabled={follow.saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: follow.saving, busy: follow.saving }}
              testID="follow-up-save"
            >
              <Text style={styles.primaryButtonText}>
                {follow.saving ? t('followUp.actions.saving') : t('followUp.actions.save')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              onPress={() => void follow.saveAsDraft()}
              disabled={follow.saving}
              accessibilityRole="button"
              testID="follow-up-save-draft"
            >
              <Text style={styles.secondaryButtonText}>{t('followUp.actions.saveDraft')}</Text>
            </Pressable>
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
    paddingHorizontal: 30,
    paddingTop: 12,
    gap: 16,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 18, fontWeight: '500', color: PALETTE.text.title },
  screenTitle: { fontSize: 30, fontWeight: '800', color: PALETTE.text.title },
  pressed: { opacity: 0.8 },
  contextLine: { fontSize: 13, color: PALETTE.text.muted },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 18, fontWeight: '600', color: PALETTE.text.title },
  pillInput: {
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
  pillTextInput: { flex: 1, fontSize: 16, color: PALETTE.text.body, paddingVertical: 8 },
  selectValue: { fontSize: 16, color: PALETTE.text.body },
  selectPlaceholder: { fontSize: 16, color: PALETTE.input.placeholder },
  dropdownMenu: {
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
  dropdownOptionSelected: { backgroundColor: PALETTE.primaryLight },
  optionText: { fontSize: 15, color: PALETTE.text.body },
  optionTextSelected: { fontWeight: '700', color: PALETTE.primary },
  textAreaBox: {
    backgroundColor: '#F7F7F7',
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 124,
  },
  textArea: { fontSize: 15, color: PALETTE.text.body, minHeight: 96 },
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
  chipText: { fontSize: 14, fontWeight: '600', color: PALETTE.text.body },
  chipTextSelected: { color: PALETTE.text.light },
  hint: { fontSize: 12, color: PALETTE.text.muted },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkLabel: { flex: 1, fontSize: 15, color: PALETTE.text.body },
  offlineText: { fontSize: 13, color: PALETTE.secondaryPressed },
  fieldError: { fontSize: 13, color: PALETTE.feedback.error },
  noticeText: { fontSize: 13, color: PALETTE.primary, textAlign: 'center' },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
    borderRadius: 16,
    padding: 12,
  },
  errorBannerText: { fontSize: 14, color: PALETTE.feedback.error },
  actions: { gap: 12 },
  primaryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: PALETTE.text.light, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderRadius: 28,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: PALETTE.primary,
    backgroundColor: PALETTE.surface,
  },
  secondaryButtonText: { color: PALETTE.primary, fontSize: 16, fontWeight: '700' },
  centerBox: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  mutedText: { fontSize: 14, color: PALETTE.text.muted, textAlign: 'center' },
  errorText: { fontSize: 15, color: PALETTE.feedback.error, textAlign: 'center' },
  smallButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  smallButtonText: { color: PALETTE.text.light, fontSize: 15, fontWeight: '600' },
});
