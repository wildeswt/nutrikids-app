import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { font } from '../../constants/typography.js';
import { formatDateInput, parseDateInput } from '../../lib/checkup-form.js';
import { isoToLocalDate } from '../../lib/child-form.js';
import { KeyboardAwareTextInput } from '../KeyboardAwareScrollView.js';
import { PillField } from '../ui/PillField.js';

export interface BirthDateFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  editable?: boolean;
  openPickerLabel: string;
  closePickerLabel: string;
  maximumDate?: Date;
  minimumDate?: Date;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Campo píldora único para fecha de nacimiento (`DD/MM/AAAA`) con selector de calendario nativo.
 */
export function BirthDateField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  editable = true,
  openPickerLabel,
  closePickerLabel,
  maximumDate,
  minimumDate,
  testID = 'birth-date-field',
  style,
}: BirthDateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowPicker(false);
    }
    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }
    onChangeText(formatDateInput(selectedDate));
  };

  const maxDate = maximumDate ?? new Date();
  const parsedIso = parseDateInput(value);
  const pickerValue = (parsedIso ? isoToLocalDate(parsedIso) : null) ?? maxDate;

  return (
    <View style={style}>
      <PillField
        label={label}
        error={error}
        testID={`${testID}-field`}
        rightIcon={
          <Pressable
            onPress={() => {
              if (editable) setShowPicker((prev) => !prev);
            }}
            disabled={!editable}
            accessibilityRole="button"
            accessibilityLabel={openPickerLabel}
            accessibilityState={{ disabled: !editable }}
            testID={`${testID}-picker-button`}
            hitSlop={8}
            style={({ pressed }) => pressed && editable && styles.pressed}
          >
            <Ionicons name="calendar-outline" size={22} color={PALETTE.text.body} />
          </Pressable>
        }
      >
        <KeyboardAwareTextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          keyboardType="numbers-and-punctuation"
          placeholder={placeholder}
          placeholderTextColor={PALETTE.input.placeholder}
          accessibilityLabel={label}
          testID={testID}
        />
      </PillField>

      {showPicker && editable ? (
        <View style={styles.datePickerWrapper}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={maxDate}
            minimumDate={minimumDate}
            onChange={handlePickerChange}
            testID={`${testID}-picker`}
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => setShowPicker(false)}
              accessibilityRole="button"
              accessibilityLabel={closePickerLabel}
              testID={`${testID}-picker-done`}
              style={({ pressed }) => [styles.datePickerDone, pressed && styles.pressed]}
            >
              <Text style={styles.datePickerDoneText}>{closePickerLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
    paddingVertical: 0,
  },
  datePickerWrapper: {
    marginTop: 8,
    backgroundColor: PALETTE.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    overflow: 'hidden',
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  datePickerDoneText: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  pressed: {
    opacity: 0.75,
  },
});
