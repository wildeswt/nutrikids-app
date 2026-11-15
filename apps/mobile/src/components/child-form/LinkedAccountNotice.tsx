import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { font } from '../../constants/typography.js';

export interface LinkedAccountNoticeProps {
  accountName: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Aviso que indica la cuenta de cuidador a la que quedará vinculado el niño registrado.
 */
export function LinkedAccountNotice({
  accountName,
  testID = 'linked-account-notice',
  style,
}: LinkedAccountNoticeProps) {
  const { t } = useTranslation('caregiver');
  const trimmedName = accountName.trim();

  if (!trimmedName) {
    return null;
  }

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Ionicons name="people-outline" size={20} color={PALETTE.text.body} />
      <Text style={styles.text}>{t('addChild.linkedAccountNotice', { name: trimmedName })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 4,
  },
  text: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 13,
    lineHeight: 18,
    color: PALETTE.text.body,
  },
});
