import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { FIELD_HEIGHT, RADIUS_PILL } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';

export interface PillFieldProps {
  label?: string;
  children: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string | boolean | null;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Campo con estilo pildora para entradas de texto o selectores, con etiqueta, icono y error.
 */
export function PillField({
  label,
  children,
  rightIcon,
  error,
  testID = 'pill-field',
  accessibilityRole,
  style,
  containerStyle,
}: PillFieldProps) {
  const hasError = Boolean(error);
  const errorMessage = typeof error === 'string' && error.length > 0 ? error : null;

  return (
    <View style={[styles.wrapper, style]} testID={testID} accessibilityRole={accessibilityRole}>
      {label ? (
        <Text style={styles.label} testID={`${testID}-label`}>
          {label}
        </Text>
      ) : null}

      <View
        style={[styles.pillContainer, hasError && styles.pillContainerError, containerStyle]}
        testID={`${testID}-container`}
      >
        <View style={styles.content}>{children}</View>
        {rightIcon ? (
          <View style={styles.rightIcon} testID={`${testID}-right-icon`}>
            {rightIcon}
          </View>
        ) : null}
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} accessibilityRole="alert" testID={`${testID}-error`}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
  },
  pillContainer: {
    height: FIELD_HEIGHT,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.input.background,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 8,
  },
  pillContainerError: {
    borderColor: PALETTE.feedback.error,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  rightIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
});
