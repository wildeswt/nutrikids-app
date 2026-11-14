import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse } from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useDataRights } from '../../hooks/useDataRights.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatChildAge } from '../../lib/children-api.js';
import { formatDateInput } from '../../lib/checkup-form.js';
import { isIdentityLockedError, isNotLegalRepresentativeError } from '../../lib/data-rights-api.js';
import {
  buildRectifyInput,
  rectifyFormFromChild,
  type RectifyFormData,
  type RectifyFormError,
} from '../../lib/rectify-form.js';

interface EditChildFormProps {
  child: ChildResponse;
  /** `true` once the child is known to have no checkups (birth date and sex can change). */
  identityEditable: boolean;
  /** `checking` while it is read, `locked` when the child has checkups. */
  identityState: 'checking' | 'editable' | 'locked' | 'unknown';
  onBack: () => void;
}

export function EditChildForm({
  child,
  identityEditable,
  identityState,
  onBack,
}: EditChildFormProps) {
  const { t } = useTranslation(['caregiver', 'common']);
  const { rectify, busy } = useDataRights(child.id);
  const [form, setForm] = useState<RectifyFormData>(() => rectifyFormFromChild(child));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const saving = busy === 'rectify';

  const update = (patch: Partial<RectifyFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrorMessage(null);
  };

  const formErrorMessage = (error: RectifyFormError): string =>
    error.code === 'dateInvalid'
      ? t('editChild.errors.dateInvalid', { example: formatDateInput(new Date()) })
      : error.code === 'invalid'
        ? t('editChild.errors.noChanges')
        : t(`editChild.errors.${error.code}`);

  const handleSave = async () => {
    if (saving) return;
    const result = buildRectifyInput(form, child, { identityEditable });
    if (!result.ok) {
      setErrorMessage(formErrorMessage(result.error));
      return;
    }

    try {
      await rectify(result.input);
      Alert.alert(
        t('editChild.successTitle'),
        t('editChild.successMessage', { name: result.input.firstName ?? child.firstName }),
        [{ text: t('common:actions.accept'), onPress: onBack }],
      );
    } catch (err) {
      setErrorMessage(
        isNotLegalRepresentativeError(err)
          ? t('editChild.errors.forbidden', { name: child.firstName })
          : isIdentityLockedError(err)
            ? t('editChild.errors.identityLocked')
            : err instanceof Error
              ? err.message
              : t('editChild.errors.noChanges'),
      );
    }
  };

  const fieldsLocked = !identityEditable;

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
      <Pressable
        style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('editChild.back')}
        testID="edit-child-back"
      >
        <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        <Text style={styles.backText}>{t('editChild.back')}</Text>
      </Pressable>
      <Text style={styles.screenTitle}>{t('editChild.title')}</Text>

      <ChildBanner
        style={styles.banner}
        name={`${child.firstName} ${child.lastName}`}
        subtitle={t('editChild.childSubtitle', {
          age: formatChildAge(child.birthDate),
          birthDate: formatLongDate(child.birthDate),
        })}
      />

      {errorMessage ? (
        <View style={styles.errorBanner} accessibilityRole="alert" testID="edit-child-error">
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('editChild.firstNameLabel')}</Text>
        <View style={styles.pillInputContainer}>
          <KeyboardAwareTextInput
            style={styles.pillTextInput}
            value={form.firstName}
            onChangeText={(value) => update({ firstName: value })}
            autoCapitalize="words"
            accessibilityLabel={t('editChild.firstNameLabel')}
            testID="edit-child-first-name"
          />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('editChild.lastNameLabel')}</Text>
        <View style={styles.pillInputContainer}>
          <KeyboardAwareTextInput
            style={styles.pillTextInput}
            value={form.lastName}
            onChangeText={(value) => update({ lastName: value })}
            autoCapitalize="words"
            accessibilityLabel={t('editChild.lastNameLabel')}
            testID="edit-child-last-name"
          />
        </View>
      </View>

      {identityState === 'checking' ? (
        <View style={styles.notice} testID="edit-child-checking">
          <ActivityIndicator size="small" color={PALETTE.primary} />
          <Text style={styles.noticeText}>{t('editChild.checking')}</Text>
        </View>
      ) : null}

      {identityState === 'locked' ? (
        <View style={styles.notice} testID="edit-child-locked">
          <Ionicons name="lock-closed-outline" size={20} color={PALETTE.feedback.warning} />
          <Text style={styles.noticeText}>{t('editChild.locked', { name: child.firstName })}</Text>
        </View>
      ) : null}

      <View style={[styles.fieldGroup, fieldsLocked && styles.fieldLocked]}>
        <Text style={styles.fieldLabel}>{t('editChild.birthDateLabel')}</Text>
        <View style={styles.pillInputContainer}>
          <KeyboardAwareTextInput
            style={styles.pillTextInput}
            value={form.birthDateText}
            onChangeText={(value) => update({ birthDateText: value })}
            editable={!fieldsLocked}
            keyboardType="numbers-and-punctuation"
            placeholder={t('editChild.datePlaceholder', { example: formatDateInput(new Date()) })}
            placeholderTextColor={PALETTE.input.placeholder}
            accessibilityLabel={t('editChild.birthDateLabel')}
            testID="edit-child-birth-date"
          />
          <Ionicons name="calendar" size={22} color="#27272A" />
        </View>
      </View>

      <View style={[styles.fieldGroup, fieldsLocked && styles.fieldLocked]}>
        <Text style={styles.fieldLabel}>{t('editChild.sexLabel')}</Text>
        <View style={styles.chipRow}>
          {(['MALE', 'FEMALE'] as const).map((option) => {
            const selected = form.sex === option;
            return (
              <Pressable
                key={option}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => update({ sex: option })}
                disabled={fieldsLocked}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: fieldsLocked }}
                testID={`edit-child-sex-${option}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {t(option === 'MALE' ? 'addChild.sexMale' : 'addChild.sexFemale')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
        onPress={() => void handleSave()}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel={t('editChild.submit')}
        accessibilityState={{ busy: saving, disabled: saving }}
        testID="edit-child-submit"
      >
        <Text style={styles.submitButtonText}>
          {saving ? t('editChild.saving') : t('editChild.submit')}
        </Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

export default function EditChildScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { status, children, error, load } = useChildren();
  const child = children.find((item) => item.id === params.childId) ?? null;
  const checkups = useCheckups(child?.id ?? null, { autoLoad: false });
  const loadCheckups = checkups.load;

  // The tabs keep their screens mounted, so the data is read again each time this one is shown.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const childId = child?.id;
  useFocusEffect(
    useCallback(() => {
      if (childId) void loadCheckups();
    }, [childId, loadCheckups]),
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.MY_DATA);
    }
  };

  const renderState = (content: React.ReactNode, testID: string) => (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.scrollContent}>
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('editChild.back')}
          testID="edit-child-back"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('editChild.back')}</Text>
        </Pressable>
        <View style={styles.stateBox} testID={testID}>
          {content}
        </View>
      </View>
    </SafeAreaView>
  );

  if (!child) {
    if (status === 'idle' || status === 'loading') {
      return renderState(<ActivityIndicator color={PALETTE.primary} />, 'edit-child-loading');
    }
    if (status === 'error') {
      return renderState(
        <>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() => void load()}
            accessibilityRole="button"
            testID="edit-child-retry"
          >
            <Text style={styles.stateButtonText}>{t('myData.retry')}</Text>
          </Pressable>
        </>,
        'edit-child-error-state',
      );
    }
    return renderState(
      <>
        <Text style={styles.stateTitle}>{t('editChild.notFoundTitle')}</Text>
        <Text style={styles.stateText}>{t('editChild.notFoundSubtitle')}</Text>
        <Pressable
          style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
          onPress={() => router.replace(APP_ROUTES.CAREGIVER.MY_DATA)}
          accessibilityRole="button"
          testID="edit-child-to-list"
        >
          <Text style={styles.stateButtonText}>{t('editChild.backToList')}</Text>
        </Pressable>
      </>,
      'edit-child-not-found',
    );
  }

  const identityState =
    checkups.status === 'empty'
      ? 'editable'
      : checkups.status === 'ready'
        ? 'locked'
        : checkups.status === 'error'
          ? 'unknown'
          : 'checking';

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right', 'bottom']}
      testID="caregiver-edit-child-screen"
    >
      <EditChildForm
        // A different child (or a refreshed record) starts the form again with its data.
        key={`${child.id}-${child.firstName}-${child.lastName}-${child.birthDate}-${child.sex}`}
        child={child}
        identityEditable={identityState === 'editable'}
        identityState={identityState}
        onBack={handleBack}
      />
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
    marginBottom: 14,
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
    marginBottom: 16,
  },
  banner: {
    marginBottom: 20,
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
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.feedback.warningBg,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLocked: {
    opacity: 0.55,
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
    backgroundColor: PALETTE.input.background,
    borderWidth: 1.5,
    borderColor: PALETTE.border.checkbox,
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
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    backgroundColor: PALETTE.input.background,
    borderWidth: 1.5,
    borderColor: PALETTE.border.checkbox,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  chipSelected: {
    backgroundColor: PALETTE.secondary,
    borderColor: PALETTE.secondary,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  chipTextSelected: {
    color: PALETTE.text.light,
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
    lineHeight: 20,
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  stateButtonText: {
    color: PALETTE.text.light,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
