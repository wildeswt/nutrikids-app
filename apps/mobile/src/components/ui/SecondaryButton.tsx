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

export interface SecondaryButtonProps {
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
 * Boton secundario con contorno verde y estados de carga y deshabilitado.
 */
export function SecondaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  testID = 'secondary-button',
  accessibilityRole = 'button',
  accessibilityLabel,
  style,
}: SecondaryButtonProps) {
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
        <ActivityIndicator size="small" color={PALETTE.primary} testID={`${testID}-loading`} />
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
    backgroundColor: PALETTE.background,
    borderWidth: 2,
    borderColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  buttonPressed: {
    backgroundColor: PALETTE.primaryLight,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
    textAlign: 'center',
  },
});
