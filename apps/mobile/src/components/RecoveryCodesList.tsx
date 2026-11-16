import React from 'react';
import { useTranslation } from 'react-i18next';
import { Share, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import { SecondaryButton } from './ui/SecondaryButton.js';

export interface RecoveryCodesListProps {
  codes: readonly string[];
}

/**
 * Two-factor recovery codes shown only once (NK-10): a monospace grid the user can copy
 * (selectable text) plus a share button to save them in a password manager or notes.
 */
export function RecoveryCodesList({ codes }: RecoveryCodesListProps) {
  const { t } = useTranslation('auth');

  const handleShare = () => {
    void Share.share({
      message: t('recoveryCodes.shareMessage', { codes: codes.join('\n') }),
    }).catch(() => {
      // Sharing is optional: the codes stay on screen.
    });
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.grid}
        accessible
        accessibilityLabel={`${t('recoveryCodes.listA11y')}: ${codes.join(', ')}`}
        testID="recovery-codes-list"
      >
        {codes.map((code) => (
          <Text key={code} style={styles.code} selectable>
            {code}
          </Text>
        ))}
      </View>
      <SecondaryButton
        label={t('recoveryCodes.share')}
        onPress={handleShare}
        testID="share-recovery-codes"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    backgroundColor: PALETTE.input.background,
  },
  code: {
    width: '48%',
    textAlign: 'center',
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 1,
    color: PALETTE.text.body,
    fontVariant: ['tabular-nums'],
  },
});
