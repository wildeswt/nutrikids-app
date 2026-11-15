import React from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL } from '../../constants/layout.js';

export interface CardProps {
  children: React.ReactNode;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<ViewStyle>;
}

/**
 * Contenedor tipo tarjeta con superficie clara, esquinas redondeadas y sombra estandar.
 */
export function Card({ children, testID = 'card', accessibilityRole, style }: CardProps) {
  return (
    <View testID={testID} accessibilityRole={accessibilityRole} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: RADIUS_PILL,
    padding: 16,
    ...CARD_SHADOW,
  },
});
