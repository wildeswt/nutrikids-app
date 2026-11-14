import type { ChildResponse } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { APP_ROUTES } from '../constants/routes.js';
import { useConsent } from '../hooks/useConsent.js';
import { formatNumericDate } from '../i18n/format.js';

interface ConsentChildItemProps {
  child: ChildResponse;
}

/** Consent of one child: status, details, "Ver documento" and "Retirar permiso" (NK-20). */
export function ConsentChildItem({ child }: ConsentChildItemProps) {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const { status, consent, error, revoke } = useConsent(child.id);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    return formatNumericDate(new Date(isoString));
  };

  const handleRevoke = () => {
    Alert.alert(
      t('consentItem.revokeTitle'),
      t('consentItem.revokeMessage', { name: `${child.firstName} ${child.lastName}` }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('consentItem.revokeConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await revoke();
              Alert.alert(
                t('consentItem.revokeSuccessTitle'),
                t('consentItem.revokeSuccessMessage'),
              );
            } catch (err) {
              Alert.alert(
                t('consentItem.revokeErrorTitle'),
                err instanceof Error ? err.message : t('consentItem.revokeErrorMessage'),
              );
            }
          },
        },
      ],
    );
  };

  const handleView = () => {
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT,
      params: {
        childId: child.id,
        childName: `${child.firstName} ${child.lastName}`,
        mode: 'view',
      },
    });
  };

  return (
    <View style={styles.childConsentCard} testID={`consent-child-${child.id}`}>
      <View style={styles.childHeader}>
        <Text style={styles.childName}>
          {child.firstName} {child.lastName}
        </Text>
        {status === 'loading' ? (
          <ActivityIndicator size="small" color="#16A34A" />
        ) : consent && !consent.revokedAt ? (
          <Text style={[styles.badgeBase, styles.badgeActive]}>{t('consentItem.badgeActive')}</Text>
        ) : consent?.revokedAt ? (
          <Text style={[styles.badgeBase, styles.badgeRevoked]}>
            {t('consentItem.badgeRevoked')}
          </Text>
        ) : (
          <Text style={[styles.badgeBase, styles.badgeNone]}>{t('consentItem.badgeNone')}</Text>
        )}
      </View>

      {error && <Text style={styles.itemErrorText}>{error}</Text>}

      {consent && !consent.revokedAt && (
        <View style={styles.consentDetails}>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>{t('consentItem.version')}</Text>
            {consent.textVersion}
          </Text>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>{t('consentItem.date')}</Text>
            {formatDate(consent.grantedAt)}
          </Text>
        </View>
      )}

      {consent?.revokedAt && (
        <View style={styles.consentDetails}>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>{t('consentItem.revokedOn')}</Text>
            {formatDate(consent.revokedAt)}
          </Text>
        </View>
      )}

      <View style={styles.childActionsRow}>
        <Pressable
          style={({ pressed }) => [styles.actionButtonOutline, pressed && styles.buttonPressed]}
          onPress={handleView}
          testID={`view-consent-${child.id}`}
        >
          <Text style={styles.actionButtonOutlineText}>{t('consentItem.viewDocument')}</Text>
        </Pressable>

        {consent && !consent.revokedAt && (
          <Pressable
            style={({ pressed }) => [styles.actionButtonRevoke, pressed && styles.buttonPressed]}
            onPress={handleRevoke}
            testID={`revoke-consent-${child.id}`}
          >
            <Text style={styles.actionButtonRevokeText}>{t('consentItem.revoke')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  childConsentCard: {
    backgroundColor: PALETTE.input.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 8,
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  childName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  badgeBase: {
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
  },
  badgeRevoked: {
    backgroundColor: '#FEE2E2',
    color: PALETTE.feedback.error,
  },
  badgeNone: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  consentDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  consentDetailText: {
    fontSize: 12,
    color: '#4B5563',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#374151',
  },
  itemErrorText: {
    fontSize: 11,
    color: PALETTE.feedback.error,
  },
  childActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  actionButtonOutline: {
    borderColor: '#D1D5DB',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  actionButtonOutlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  actionButtonRevoke: {
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  actionButtonRevokeText: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.feedback.error,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
