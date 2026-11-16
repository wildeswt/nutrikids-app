import type { AccountResponse } from '@nutrikids/shared';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { RADIUS_PILL } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import { useAuth } from '../context/auth-context.js';
import {
  fetchAccount,
  isEmailTakenError,
  isWrongPasswordError,
  updateAccount,
} from '../lib/account-api.js';
import {
  accountToFormValues,
  buildAccountUpdate,
  emailChanged,
  type AccountFormErrors,
  type AccountFormValues,
} from '../lib/account-form.js';
import { PillField } from './ui/PillField.js';
import { PrimaryButton } from './ui/PrimaryButton.js';
import { SecondaryButton } from './ui/SecondaryButton.js';

/**
 * "Mi cuenta" on the My data screen (NK-55): name, email and contact phone, editable.
 * Changing the email (the login credential) asks for the current password.
 */
// NOTE: lib/account-api.ts supports PATCH /account, so account fields are editable inline.
export function AccountCard() {
  const { t } = useTranslation('caregiver');
  const { updateUser } = useAuth();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<AccountFormValues | null>(null);
  const [errors, setErrors] = useState<AccountFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const loaded = await fetchAccount();
      setAccount(loaded);
      setValues(accountToFormValues(loaded));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <View style={styles.card} testID="account-loading">
        <ActivityIndicator color={PALETTE.primary} />
      </View>
    );
  }

  if (state === 'error' || !account || !values) {
    return (
      <View style={styles.card} testID="account-error">
        <Text style={styles.errorText}>{t('myData.account.loadError')}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void load()}
          accessibilityRole="button"
          testID="account-retry"
        >
          <Text style={styles.secondaryButtonText}>{t('myData.account.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const setField = (field: keyof AccountFormValues) => (text: string) => {
    setValues((prev) => (prev ? { ...prev, [field]: text } : prev));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
  };

  const handleSave = async () => {
    const result = buildAccountUpdate(values, account);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateAccount(result.input);
      setAccount(updated);
      setValues(accountToFormValues(updated));
      await updateUser({
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
      });
      setEditing(false);
      setSaved(true);
    } catch (err) {
      if (isWrongPasswordError(err))
        setErrors({ currentPassword: t('myData.account.wrongPassword') });
      else if (isEmailTakenError(err)) setErrors({ email: t('myData.account.emailTaken') });
      else setFormError(err instanceof Error ? err.message : t('myData.account.loadError'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValues(accountToFormValues(account));
    setErrors({});
    setFormError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <View style={styles.section} testID="my-data-account">
        <PillField label={t('myData.name')}>
          <Text style={styles.readOnlyText}>{`${account.firstName} ${account.lastName}`}</Text>
        </PillField>
        <PillField label={t('myData.email')}>
          <Text style={styles.readOnlyText}>{account.email}</Text>
        </PillField>
        <PillField label={t('myData.phone')}>
          <Text style={styles.readOnlyText}>{account.phone ?? '-'}</Text>
        </PillField>
        {saved ? (
          <Text style={styles.successText} accessibilityRole="alert" testID="account-saved">
            {t('myData.account.saved')}
          </Text>
        ) : null}
        <View style={styles.buttonWrapper}>
          <PrimaryButton
            label={t('myData.account.edit')}
            onPress={() => {
              setSaved(false);
              setEditing(true);
            }}
            accessibilityLabel={t('myData.account.edit')}
            testID="my-data-edit-account"
          />
        </View>
      </View>
    );
  }

  const needsPassword = emailChanged(values, account);

  return (
    <View style={styles.section} testID="account-form">
      <Field
        label={t('myData.account.firstName')}
        value={values.firstName}
        onChangeText={setField('firstName')}
        error={errors.firstName}
        testID="account-first-name"
      />
      <Field
        label={t('myData.account.lastName')}
        value={values.lastName}
        onChangeText={setField('lastName')}
        error={errors.lastName}
        testID="account-last-name"
      />
      <Field
        label={t('myData.account.email')}
        value={values.email}
        onChangeText={setField('email')}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        testID="account-email"
      />
      <Field
        label={`${t('myData.account.phone')} (${t('myData.account.phoneHint')})`}
        value={values.phone}
        onChangeText={setField('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        testID="account-phone"
      />
      {needsPassword ? (
        <>
          <Text style={styles.hint}>{t('myData.account.currentPasswordHint')}</Text>
          <Field
            label={t('myData.account.currentPassword')}
            value={values.currentPassword}
            onChangeText={setField('currentPassword')}
            error={errors.currentPassword}
            secureTextEntry
            autoCapitalize="none"
            testID="account-current-password"
          />
        </>
      ) : null}
      {formError ? (
        <Text style={styles.errorText} accessibilityRole="alert" testID="account-form-error">
          {formError}
        </Text>
      ) : null}
      <View style={styles.buttonGroup}>
        <PrimaryButton
          label={saving ? t('myData.account.saving') : t('myData.account.save')}
          onPress={() => void handleSave()}
          loading={saving}
          disabled={saving}
          testID="account-save"
        />
        <SecondaryButton
          label={t('myData.account.cancel')}
          onPress={handleCancel}
          disabled={saving}
          testID="account-cancel"
        />
      </View>
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | undefined;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
  secureTextEntry?: boolean;
  testID: string;
}

function Field({ label, error, testID, ...input }: FieldProps) {
  return (
    <PillField label={label} error={error}>
      <TextInput
        {...input}
        style={styles.input}
        placeholderTextColor={PALETTE.input.placeholder}
        accessibilityLabel={label}
        testID={testID}
      />
    </PillField>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    padding: 20,
    marginBottom: 24,
    gap: 12,
  },
  section: {
    marginBottom: 24,
    gap: 14,
  },
  readOnlyText: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
  },
  input: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    paddingVertical: 0,
  },
  hint: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
  successText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.primary,
  },
  buttonWrapper: {
    alignItems: 'center',
    marginTop: 6,
  },
  buttonGroup: {
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  secondaryButton: {
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: PALETTE.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
    fontSize: 15,
  },
});
