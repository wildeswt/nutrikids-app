import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { useGrowthMessage } from '../hooks/useGrowthMessage.js';
import { formatLongDate } from '../i18n/format.js';

interface ChildGrowthStatusProps {
  childId: string;
  childName: string;
}

/**
 * Growth status of a child on the caregiver Home (NK-35, RF-14): "Todo va bien" until the
 * professional reviews the alert, then the orientation and the next checkup. Short text plus
 * icon (never color alone) and no technical values.
 */
export function ChildGrowthStatus({ childId, childName }: ChildGrowthStatusProps) {
  const { t } = useTranslation('caregiver');
  const { status, message } = useGrowthMessage(childId);
  const reviewed = status === 'ready' && message?.status === 'reviewed';

  if (!reviewed || !message) {
    return (
      <View style={styles.pill} testID={`growth-status-ok-${childId}`}>
        <Ionicons name="checkmark-circle" size={15} color={PALETTE.primary} />
        <Text style={styles.pillText}>{t('home.statusOk')}</Text>
      </View>
    );
  }

  const summaryKey =
    message.concern === 'below'
      ? 'home.growth.below'
      : message.concern === 'above'
        ? 'home.growth.above'
        : 'home.growth.reviewed';

  return (
    <View testID={`growth-status-reviewed-${childId}`}>
      <View style={styles.pill}>
        <Ionicons name="information-circle" size={15} color={PALETTE.primary} />
        <Text style={styles.pillText}>{t('home.growth.reviewedPill')}</Text>
      </View>
      <Text style={styles.text}>{t(summaryKey, { name: childName })}</Text>
      {message.recommendation ? (
        <Text style={styles.text}>
          {t('home.growth.recommendation', { text: message.recommendation })}
        </Text>
      ) : null}
      {message.nextCheckupDate ? (
        <Text style={[styles.text, styles.strong]}>
          {t('home.growth.nextCheckup', { date: formatLongDate(message.nextCheckupDate) })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: PALETTE.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 8,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  text: {
    color: PALETTE.text.light,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  strong: {
    fontWeight: '700',
  },
});
