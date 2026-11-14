import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AccountResponse } from '@nutrikids/shared';
import { PALETTE } from '../constants/colors.js';
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

/**
 * "Mi cuenta" on the My data screen (NK-55): name, email and contact phone, editable.
 * Changing the email (the login credential) asks for the current password.
 */
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
      <View style={styles.card} testID="my-data-account">
        <Row label={t('myData.name')} value={`${account.firstName} ${account.lastName}`} />
        <Row label={t('myData.email')} value={account.email} />
        <Row label={t('myData.phone')} value={account.phone ?? '-'} />
        {saved ? (
          <Text style={styles.successText} accessibilityRole="alert" testID="account-saved">
            {t('myData.account.saved')}
          </Text>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={() => {
            setSaved(false);
            setEditing(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('myData.account.edit')}
          testID="my-data-edit-account"
        >
          <Text style={styles.primaryButtonText}>{t('myData.account.edit')}</Text>
        </Pressable>
      </View>
    );
  }

  const needsPassword = emailChanged(values, account);

  return (
    <View style={styles.card} testID="account-form">
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
      <Pressable
        style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.pressed]}
        onPress={() => void handleSave()}
        disabled={saving}
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        testID="account-save"
      >
        <Text style={styles.primaryButtonText}>
          {saving ? t('myData.account.saving') : t('myData.account.save')}
        </Text>
      </Pressable>
      <Pressable
        style={styles.secondaryButton}
        onPress={handleCancel}
        disabled={saving}
        accessibilityRole="button"
        testID="account-cancel"
      >
        <Text style={styles.secondaryButtonText}>{t('myData.account.cancel')}</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...input}
        style={[styles.input, error ? styles.inputError : null]}
        accessibilityLabel={label}
        testID={testID}
      />
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    padding: 20,
    marginBottom: 24,
    gap: 12,
  },
  row: { gap: 2 },
  rowLabel: { fontSize: 13, color: PALETTE.text.muted, fontWeight: '600' },
  rowValue: { fontSize: 16, color: PALETTE.text.title, fontWeight: '700' },
  field: { gap: 4 },
  fieldLabel: { fontSize: 13, color: PALETTE.text.muted, fontWeight: '600' },
  input: {
    backgroundColor: PALETTE.input.background,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    borderRadius: 25,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    color: PALETTE.text.title,
  },
  inputError: { borderColor: PALETTE.feedback.error },
  hint: { fontSize: 13, color: PALETTE.text.muted },
  errorText: { fontSize: 13, color: PALETTE.feedback.error },
  successText: { fontSize: 14, color: PALETTE.primary, fontWeight: '700' },
  primaryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: PALETTE.text.light, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderRadius: 25,
    borderWidth: 1,
    borderColor: PALETTE.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: PALETTE.primary, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
