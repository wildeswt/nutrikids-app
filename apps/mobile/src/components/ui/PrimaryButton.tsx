import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_HEIGHT, BUTTON_WIDTH, RADIUS_PILL } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';

export interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Boton principal en forma de pildora con soporte para estados de carga y deshabilitado.
 */
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  testID = 'primary-button',
  accessibilityRole = 'button',
  accessibilityLabel,
  style,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={PALETTE.text.light} testID={`${testID}-loading`} />
      ) : (
        <Text style={styles.label} testID={`${testID}-label`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    maxWidth: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  buttonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.text.light,
  },
});
