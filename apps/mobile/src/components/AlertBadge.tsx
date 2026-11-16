import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../constants/colors.js';

export type AlertBadgeVariant = 'risk' | 'severe' | 'status' | 'ok';

const SEVERE_COLOR = '#E14100';

const COLORS: Record<AlertBadgeVariant, { bg: string; fg: string }> = {
  risk: { bg: PALETTE.secondaryLight, fg: PALETTE.secondaryPressed },
  severe: { bg: PALETTE.feedback.errorBg, fg: SEVERE_COLOR },
  status: { bg: PALETTE.border.subtle, fg: PALETTE.text.body },
  ok: { bg: '#E8F1F0', fg: PALETTE.primary },
};

/** Single source for alert/status badge colors, shared by every professional screen. */
export function AlertBadge({
  label,
  variant,
  icon,
  style,
  testID,
}: {
  label: string;
  variant: AlertBadgeVariant;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { bg, fg } = COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]} testID={testID}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 25,
  },
  text: { fontSize: 11, fontWeight: '600' },
});
