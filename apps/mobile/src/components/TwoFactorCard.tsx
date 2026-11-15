import type { TwoFactorStatus } from '@nutrikids/shared';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import {
  fetchTwoFactorStatus,
  isInvalidTotpError,
  regenerateRecoveryCodes,
} from '../lib/two-factor-api.js';
import { RecoveryCodesList } from './RecoveryCodesList.js';
import { PillField } from './ui/PillField.js';
import { PrimaryButton } from './ui/PrimaryButton.js';
import { SecondaryButton } from './ui/SecondaryButton.js';

/** Below this many recovery codes left, the card suggests generating new ones. */
export const LOW_RECOVERY_CODES = 3;

export interface TwoFactorCardProps {
  /** Initial status (tests); when absent it is fetched from the API. */
  initialStatus?: TwoFactorStatus | null;
}

/**
 * Two-factor section of the professional profile (NK-10): shows that it is active, how many
 * recovery codes are left, and lets the professional replace them with a current TOTP code.
 */
export function TwoFactorCard({ initialStatus = null }: TwoFactorCardProps) {
  const { t } = useTranslation(['professional', 'auth', 'common']);
  const [status, setStatus] = useState<TwoFactorStatus | null>(initialStatus);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (initialStatus) return;
    let active = true;
    fetchTwoFactorStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [initialStatus]);

  const handleRegenerate = async () => {
    if (!/^\d{6}$/.test(totpCode)) {
      setError(t('profile.twoFactor.invalidCode'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const codes = await regenerateRecoveryCodes(totpCode);
      setNewCodes(codes);
      setStatus({ enabled: true, recoveryCodesRemaining: codes.length });
      setRegenerating(false);
      setTotpCode('');
    } catch (err) {
      setError(
        isInvalidTotpError(err)
          ? t('profile.twoFactor.invalidCode')
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setRegenerating(false);
    setTotpCode('');
    setError(null);
  };

  return (
    <View style={styles.container} testID="two-factor-card">
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('profile.twoFactor.title')}</Text>
        {status?.enabled && (
          <Text style={styles.badge}>{t('profile.twoFactor.statusEnabled')}</Text>
        )}
      </View>

      {loadError && <Text style={styles.error}>{loadError}</Text>}
      {!status && !loadError && (
        <Text style={styles.muted}>{t('profile.twoFactor.statusLoading')}</Text>
      )}

      {status?.enabled && !newCodes && (
        <>
          <Text style={styles.muted}>
            {t('profile.twoFactor.remaining', { count: status.recoveryCodesRemaining })}
          </Text>
          {status.recoveryCodesRemaining <= LOW_RECOVERY_CODES && (
            <Text style={styles.warning}>{t('profile.twoFactor.lowCodes')}</Text>
          )}
        </>
      )}

      {newCodes && (
        <>
          <Text style={styles.muted}>{t('auth:recoveryCodes.description')}</Text>
          <RecoveryCodesList codes={newCodes} />
          <PrimaryButton label={t('profile.twoFactor.done')} onPress={() => setNewCodes(null)} />
        </>
      )}

      {status?.enabled && !newCodes && !regenerating && (
        <SecondaryButton
          label={t('profile.twoFactor.regenerate')}
          onPress={() => setRegenerating(true)}
          testID="regenerate-recovery-codes"
        />
      )}

      {regenerating && (
        <>
          <Text style={styles.muted}>{t('profile.twoFactor.regenerateDescription')}</Text>
          <PillField label={t('profile.twoFactor.totpLabel')} error={error}>
            <TextInput
              style={styles.input}
              value={totpCode}
              onChangeText={(text) => setTotpCode(text.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={PALETTE.input.placeholder}
              keyboardType="number-pad"
              maxLength={6}
              editable={!submitting}
              testID="regenerate-totp-input"
            />
          </PillField>
          <PrimaryButton
            label={t('profile.twoFactor.confirm')}
            onPress={() => void handleRegenerate()}
            loading={submitting}
          />
          <SecondaryButton label={t('common:actions.cancel')} onPress={handleCancel} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.text.title,
  },
  badge: {
    fontFamily: font('semibold'),
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.feedback.success,
    backgroundColor: PALETTE.feedback.successBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  muted: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    lineHeight: 18,
  },
  warning: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.feedback.warning,
  },
  error: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
  input: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    height: '100%',
    paddingVertical: 0,
  },
});
