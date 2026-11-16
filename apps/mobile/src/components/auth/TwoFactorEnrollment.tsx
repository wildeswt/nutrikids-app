import type { TwoFactorSetup } from '@nutrikids/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { font } from '../../constants/typography.js';
import { formatManualKey } from '../../lib/login-flow.js';

export interface TwoFactorEnrollmentProps {
  setup: TwoFactorSetup;
  /** Called when no app on the device can open the `otpauth://` link. */
  onOpenError: () => void;
}

/**
 * Two-factor activation for professionals (NK-10): QR code to scan, the key to type by hand,
 * and a link that opens the authenticator app on this same phone (`otpauth://`).
 */
export function TwoFactorEnrollment({ setup, onOpenError }: TwoFactorEnrollmentProps) {
  const { t } = useTranslation('auth');

  const handleOpen = async () => {
    try {
      await Linking.openURL(setup.otpauthUri);
    } catch {
      onOpenError();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.description}>{t('login.setupDescription')}</Text>

      <View style={styles.qrContainer}>
        <Image
          source={{ uri: setup.qrCodeDataUrl }}
          style={styles.qrImage}
          accessibilityLabel={t('login.qrA11y')}
          testID="totp-qr-code"
        />
      </View>

      <View style={styles.manualKeyBox}>
        <Text style={styles.manualKeyLabel}>{t('login.manualKeyLabel')}</Text>
        <Text style={styles.manualKeyValue} selectable testID="totp-manual-key">
          {formatManualKey(setup.secret)}
        </Text>
      </View>

      <Pressable onPress={() => void handleOpen()} accessibilityRole="link" hitSlop={6}>
        <Text style={styles.openLink}>{t('login.openAuthenticator')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  description: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  manualKeyBox: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    backgroundColor: PALETTE.input.background,
  },
  manualKeyLabel: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  manualKeyValue: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 1,
    color: PALETTE.text.body,
  },
  openLink: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 12,
    color: PALETTE.primary,
  },
});
