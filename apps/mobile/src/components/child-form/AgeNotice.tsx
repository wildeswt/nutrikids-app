import { Ionicons } from '@expo/vector-icons';
import {
  MAX_CHILD_AGE_MONTHS,
  MIN_CHILD_AGE_MONTHS,
  completedMonths,
  todayIsoDate,
} from '@nutrikids/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { font } from '../../constants/typography.js';
import { formatChildAge } from '../../lib/children-api.js';

export interface AgeNoticeProps {
  birthDateIso: string;
  referenceDateIso?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Recuadro informativo con la edad calculada del niño y si está dentro del rango de 1 a 5 años.
 */
export function AgeNotice({
  birthDateIso,
  referenceDateIso,
  testID = 'age-notice',
  style,
}: AgeNoticeProps) {
  const { t } = useTranslation('caregiver');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateIso)) {
    return null;
  }

  let months: number;
  try {
    months = completedMonths(birthDateIso, referenceDateIso ?? todayIsoDate());
  } catch {
    return null;
  }

  if (months < 0) {
    return null;
  }

  const inRange = months >= MIN_CHILD_AGE_MONTHS && months <= MAX_CHILD_AGE_MONTHS;
  const age = formatChildAge(birthDateIso);

  if (inRange) {
    return (
      <View style={[styles.validBox, style]} testID={testID}>
        <Ionicons name="time-outline" size={22} color={PALETTE.primary} />
        <Text style={styles.validText}>{t('addChild.ageInRangeNotice', { age })}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.errorBox, style]} accessibilityRole="alert" testID={testID}>
      <Ionicons name="alert-circle" size={22} color={PALETTE.feedback.error} />
      <Text style={styles.errorText}>
        {`${t('addChild.calculatedAge', { months, age })}. ${t('addChild.ageRangeHelper', {
          min: MIN_CHILD_AGE_MONTHS,
          max: MAX_CHILD_AGE_MONTHS,
        })}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  validBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PALETTE.primaryLight,
    borderRadius: 16,
    padding: 14,
  },
  validText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 13,
    lineHeight: 18,
    color: PALETTE.primary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  errorText: {
    flex: 1,
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 18,
    color: PALETTE.feedback.error,
  },
});
