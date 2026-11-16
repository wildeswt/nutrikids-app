import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import { SecondaryButton } from './ui/SecondaryButton.js';

export interface RecoveryCodesListProps {
  codes: readonly string[];
}

function downloadCodesAsTextFile(message: string): boolean {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return false;
  }
  const url = URL.createObjectURL(new Blob([message], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nutrikids-codigos-recuperacion.txt';
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Two-factor recovery codes shown only once (NK-10): a monospace grid the user can copy
 * (selectable text) plus a share button (with clipboard and text-file download fallbacks on web).
 */
export function RecoveryCodesList({ codes }: RecoveryCodesListProps) {
  const { t } = useTranslation('auth');
  const [feedback, setFeedback] = useState<'copied' | 'downloaded' | null>(null);

  const handleShare = async () => {
    const message = t('recoveryCodes.shareMessage', { codes: codes.join('\n') });
    setFeedback(null);

    if (Platform.OS !== 'web') {
      await Share.share({ message }).catch(() => {});
      return;
    }

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await Share.share({ message });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(message);
        setFeedback('copied');
        return;
      } catch {
        // Fallback to file download if clipboard permissions are denied.
      }
    }

    if (downloadCodesAsTextFile(message)) {
      setFeedback('downloaded');
    }
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
        onPress={() => void handleShare()}
        testID="share-recovery-codes"
      />
      {feedback ? (
        <Text style={styles.feedbackText} testID="recovery-codes-feedback">
          {t(`recoveryCodes.${feedback}`)}
        </Text>
      ) : null}
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
  feedbackText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.primary,
    textAlign: 'center',
  },
});
