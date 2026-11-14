import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { font } from '../../constants/typography.js';

export interface BackButtonProps {
  label?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  hitSlop?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Boton estandar de retorno con flecha y etiqueta de 20 px medium.
 */
export function BackButton({
  label = 'Volver',
  onPress,
  accessibilityLabel,
  hitSlop,
  testID = 'back-button',
  style,
}: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed, style]}
    >
      <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
      <Text style={styles.backLabel}>{label}</Text>
    </Pressable>
  );
}

export interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  showBack?: boolean;
  backLabel?: string;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<ViewStyle>;
}

/**
 * Encabezado estandar de pantalla con boton de retorno opcional y titulo principal.
 */
export function ScreenHeader({
  title,
  onBack,
  showBack = true,
  backLabel = 'Volver',
  testID = 'screen-header',
  accessibilityRole = 'header',
  style,
}: ScreenHeaderProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      {showBack ? (
        <BackButton label={backLabel} onPress={onBack} testID={`${testID}-back`} />
      ) : null}

      <Text accessibilityRole={accessibilityRole} testID={`${testID}-title`} style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backLabel: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 20,
    color: PALETTE.text.body,
  },
  title: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 32,
    color: PALETTE.text.title,
  },
});
