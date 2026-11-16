import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { font } from '../../constants/typography.js';
import { toLocalIsoDate } from '../../lib/checkup-form.js';
import { isoToLocalDate } from '../../lib/child-form.js';

export type { DateTimePickerEvent };

export interface WebDatePickerProps {
  value: Date;
  mode?: 'date' | 'time' | 'datetime' | 'countdown';
  display?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
  testID?: string;
}

function makePickerEvent(
  type: DateTimePickerEvent['type'],
  timestamp: number,
  date: Date = new Date(timestamp),
): DateTimePickerEvent {
  return {
    type,
    nativeEvent: {
      timestamp,
      utcOffset: -date.getTimezoneOffset(),
    },
  };
}

export function isIsoDateInBounds(iso: string, minIso?: string, maxIso?: string): boolean {
  if (minIso && iso < minIso) return false;
  if (maxIso && iso > maxIso) return false;
  return true;
}

/**
 * Web replacement for `@react-native-community/datetimepicker` (which returns `null` on web).
 * Uses a native HTML `<input type="date">` so mobile browsers open the OS calendar picker
 * without breaking desktop or keyboard entry.
 */
export default function WebDatePicker({
  value,
  minimumDate,
  maximumDate,
  onChange,
  testID = 'web-date-picker',
}: WebDatePickerProps) {
  const { t } = useTranslation('common');
  const propIso = toLocalIsoDate(value);
  const minIso = minimumDate ? toLocalIsoDate(minimumDate) : undefined;
  const maxIso = maximumDate ? toLocalIsoDate(maximumDate) : undefined;
  const [draftIso, setDraftIso] = useState(propIso);

  useEffect(() => {
    setDraftIso(propIso);
  }, [propIso]);

  const parsedDraft = isoToLocalDate(draftIso);
  const isValid = Boolean(parsedDraft && isIsoDateInBounds(draftIso, minIso, maxIso));

  const handleConfirm = () => {
    if (!parsedDraft || !isIsoDateInBounds(draftIso, minIso, maxIso)) return;
    onChange?.(makePickerEvent('set', parsedDraft.getTime(), parsedDraft), parsedDraft);
  };

  const handleCancel = () => {
    onChange?.(makePickerEvent('dismissed', Date.now()));
  };

  return (
    <View style={styles.container} testID={testID}>
      {React.createElement('input', {
        type: 'date',
        value: draftIso,
        min: minIso,
        max: maxIso,
        'data-testid': `${testID}-input`,
        onChange: (event: { target: { value: string } }) => {
          setDraftIso(event.target.value);
        },
        style: {
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 44,
          padding: '10px 12px',
          fontSize: 16,
          fontFamily: `${font('regular')}, system-ui, -apple-system, sans-serif`,
          color: PALETTE.text.body,
          backgroundColor: PALETTE.input.background,
          borderRadius: 12,
          border: `1px solid ${isValid ? PALETTE.border.input : PALETTE.feedback.errorBorder}`,
          outline: 'none',
        },
      })}

      <View style={styles.actions}>
        <Pressable
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel={t('actions.cancel')}
          testID={`${testID}-cancel`}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Text style={styles.cancelText}>{t('actions.cancel')}</Text>
        </Pressable>

        <Pressable
          onPress={handleConfirm}
          disabled={!isValid}
          accessibilityRole="button"
          accessibilityLabel={t('actions.accept')}
          accessibilityState={{ disabled: !isValid }}
          testID={`${testID}-confirm`}
          style={({ pressed }) => [
            styles.actionButton,
            styles.confirmButton,
            !isValid && styles.disabled,
            pressed && isValid && styles.pressed,
          ]}
        >
          <Text style={styles.confirmText}>{t('actions.accept')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    gap: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  confirmButton: {
    backgroundColor: PALETTE.primary,
  },
  cancelText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.text.muted,
  },
  confirmText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.text.light,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
});
