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
import { AgeNotice } from '../../components/child-form/AgeNotice.js';
import { BirthDateField } from '../../components/child-form/BirthDateField.js';
import { SexSelector } from '../../components/child-form/SexSelector.js';
import { PillField } from '../../components/ui/PillField.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useDataRights } from '../../hooks/useDataRights.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatDateInput } from '../../lib/checkup-form.js';
import { evaluateChildBirthDate } from '../../lib/child-form.js';
import { formatChildAge } from '../../lib/children-api.js';
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
  const birthDateStatus = evaluateChildBirthDate(form.birthDateText);

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
      <ScreenHeader
        title={t('editChild.title')}
        backLabel={t('editChild.back')}
        onBack={onBack}
        style={styles.header}
        testID="edit-child"
      />

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

      <View style={styles.formContainer}>
        <PillField label={t('editChild.firstNameLabel')} testID="edit-child-first-name-field">
          <KeyboardAwareTextInput
            style={styles.pillTextInput}
            value={form.firstName}
            onChangeText={(value) => update({ firstName: value })}
            autoCapitalize="words"
            editable={!saving}
            accessibilityLabel={t('editChild.firstNameLabel')}
            testID="edit-child-first-name"
          />
        </PillField>

        <PillField label={t('editChild.lastNameLabel')} testID="edit-child-last-name-field">
          <KeyboardAwareTextInput
            style={styles.pillTextInput}
            value={form.lastName}
            onChangeText={(value) => update({ lastName: value })}
            autoCapitalize="words"
            editable={!saving}
            accessibilityLabel={t('editChild.lastNameLabel')}
            testID="edit-child-last-name"
          />
        </PillField>

        {identityState === 'checking' ? (
          <View style={styles.notice} testID="edit-child-checking">
            <ActivityIndicator size="small" color={PALETTE.primary} />
            <Text style={styles.noticeText}>{t('editChild.checking')}</Text>
          </View>
        ) : null}

        {identityState === 'locked' ? (
          <View style={styles.notice} testID="edit-child-locked">
            <Ionicons name="lock-closed-outline" size={20} color={PALETTE.feedback.warning} />
            <Text style={styles.noticeText}>
              {t('editChild.locked', { name: child.firstName })}
            </Text>
          </View>
        ) : null}

        <BirthDateField
          label={t('editChild.birthDateLabel')}
          value={form.birthDateText}
          onChangeText={(value) => update({ birthDateText: value })}
          placeholder={t('editChild.datePlaceholder', { example: formatDateInput(new Date()) })}
          editable={!fieldsLocked}
          openPickerLabel={t('addChild.openDatePicker')}
          closePickerLabel={t('addChild.closeDatePicker')}
          testID="edit-child-birth-date"
          style={fieldsLocked ? styles.fieldLocked : undefined}
        />

        <SexSelector
          label={t('editChild.sexLabel')}
          value={form.sex}
          onChange={(sex) => update({ sex })}
          femaleLabel={t('addChild.sexFemale')}
          maleLabel={t('addChild.sexMale')}
          femaleAccessibilityLabel={t('addChild.sexFemaleA11y')}
          maleAccessibilityLabel={t('addChild.sexMaleA11y')}
          disabled={fieldsLocked}
          testID="edit-child-sex"
          style={fieldsLocked ? styles.fieldLocked : undefined}
        />

        {birthDateStatus.kind === 'valid' || birthDateStatus.kind === 'outOfRange' ? (
          <AgeNotice birthDateIso={birthDateStatus.isoDate} testID="edit-child-age-notice" />
        ) : null}
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={saving ? t('editChild.saving') : t('editChild.submit')}
          onPress={() => void handleSave()}
          loading={saving}
          disabled={saving}
          accessibilityLabel={t('editChild.submit')}
          testID="edit-child-submit"
        />
      </View>
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
        <ScreenHeader
          title={t('editChild.title')}
          backLabel={t('editChild.back')}
          onBack={handleBack}
          style={styles.header}
          testID="edit-child"
        />
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
    flexGrow: 1,
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 18,
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
    marginBottom: 18,
  },
  errorBannerText: {
    fontFamily: font('semibold'),
    color: PALETTE.feedback.error,
    fontSize: 13,
    fontWeight: '600',
  },
  formContainer: {
    gap: 20,
  },
  pillTextInput: {
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
    paddingVertical: 0,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.feedback.warningBg,
    borderRadius: 16,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
  },
  fieldLocked: {
    opacity: 0.55,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
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
    color: PALETTE.text.light,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
