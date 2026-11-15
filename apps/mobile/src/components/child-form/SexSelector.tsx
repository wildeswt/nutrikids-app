import { Ionicons } from '@expo/vector-icons';
import type { Sex } from '@nutrikids/shared';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { FIELD_HEIGHT, RADIUS_PILL } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';

/** Orden visual según Figma: Niña a la izquierda, Niño a la derecha. */
const SEX_OPTIONS = ['FEMALE', 'MALE'] as const;

export interface SexSelectorProps {
  label: string;
  value: Sex;
  onChange: (sex: Sex) => void;
  femaleLabel: string;
  maleLabel: string;
  femaleAccessibilityLabel?: string;
  maleAccessibilityLabel?: string;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Selector de sexo en dos botones píldora de igual ancho (Niña / Niño).
 */
export function SexSelector({
  label,
  value,
  onChange,
  femaleLabel,
  maleLabel,
  femaleAccessibilityLabel,
  maleAccessibilityLabel,
  disabled = false,
  testID = 'sex-selector',
  style,
}: SexSelectorProps) {
  return (
    <View style={[styles.wrapper, style]} testID={testID}>
      <Text style={styles.label} testID={`${testID}-label`}>
        {label}
      </Text>
      <View style={styles.row}>
        {SEX_OPTIONS.map((option) => {
          const selected = value === option;
          const optionLabel = option === 'FEMALE' ? femaleLabel : maleLabel;
          const optionA11y =
            option === 'FEMALE'
              ? (femaleAccessibilityLabel ?? femaleLabel)
              : (maleAccessibilityLabel ?? maleLabel);

          return (
            <Pressable
              key={option}
              style={({ pressed }) => [
                styles.option,
                selected ? styles.optionSelected : styles.optionUnselected,
                pressed && !disabled && styles.pressed,
              ]}
              onPress={() => onChange(option)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={optionA11y}
              accessibilityState={{ selected, disabled }}
              testID={`${testID}-${option}`}
            >
              {selected ? (
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={PALETTE.text.light}
                  testID={`${testID}-${option}-check`}
                />
              ) : null}
              <Text
                style={[
                  styles.optionText,
                  selected ? styles.optionTextSelected : styles.optionTextUnselected,
                ]}
              >
                {optionLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  option: {
    flex: 1,
    height: FIELD_HEIGHT,
    borderRadius: RADIUS_PILL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  optionSelected: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  optionUnselected: {
    backgroundColor: PALETTE.input.background,
    borderColor: PALETTE.border.input,
  },
  optionText: {
    fontSize: 16,
  },
  optionTextSelected: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
  },
  optionTextUnselected: {
    fontFamily: font('medium'),
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  pressed: {
    opacity: 0.85,
  },
});
