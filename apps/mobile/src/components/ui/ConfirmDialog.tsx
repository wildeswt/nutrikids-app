import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_HEIGHT, CARD_SHADOW, RADIUS_PILL } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';

export type ConfirmDialogTone = 'danger' | 'warning' | 'primary' | 'info';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  children?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: ConfirmDialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
  testID?: string;
}

function getToneConfig(tone: ConfirmDialogTone = 'primary') {
  switch (tone) {
    case 'danger':
      return {
        defaultIcon: 'warning-outline' as const,
        iconColor: PALETTE.feedback.error,
        badgeBg: PALETTE.feedback.errorBg,
        confirmBg: PALETTE.feedback.error,
        confirmPressedBg: '#c93a00',
        confirmTextColor: PALETTE.text.light,
      };
    case 'warning':
      return {
        defaultIcon: 'alert-circle-outline' as const,
        iconColor: PALETTE.secondary,
        badgeBg: PALETTE.secondaryLight,
        confirmBg: PALETTE.secondary,
        confirmPressedBg: PALETTE.secondaryPressed,
        confirmTextColor: PALETTE.text.light,
      };
    case 'info':
    case 'primary':
    default:
      return {
        defaultIcon: 'information-circle-outline' as const,
        iconColor: PALETTE.primary,
        badgeBg: PALETTE.primaryLight,
        confirmBg: PALETTE.primary,
        confirmPressedBg: PALETTE.primaryPressed,
        confirmTextColor: PALETTE.text.light,
      };
  }
}

/**
 * Dialogo modal unificado que replica la estetica de SignOutPendingDialog:
 * tarjeta centrada con bordes redondeados, icono superior en badge circular,
 * boton de cierre rápido en esquina superior derecha y botones en píldora.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  children,
  icon,
  tone = 'primary',
  confirmLabel,
  cancelLabel,
  loading = false,
  disabled = false,
  onConfirm,
  onCancel,
  testID = 'confirm-dialog',
}: ConfirmDialogProps) {
  const isBusy = loading;
  const isActionDisabled = disabled || loading;
  const toneConfig = getToneConfig(tone);
  const resolvedIcon = icon ?? toneConfig.defaultIcon;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
      testID={testID}
    >
      <View style={styles.backdrop} accessible={false}>
        <View style={styles.card} accessibilityViewIsModal testID={`${testID}-card`}>
          <View style={styles.topRow}>
            <View
              style={[styles.iconBadge, { backgroundColor: toneConfig.badgeBg }]}
              testID={`${testID}-badge`}
            >
              <Ionicons name={resolvedIcon} size={24} color={toneConfig.iconColor} />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && !isBusy && styles.buttonPressed,
              ]}
              onPress={onCancel}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              accessibilityState={{ disabled: isBusy }}
              testID={`${testID}-close`}
            >
              <Ionicons name="close" size={20} color={PALETTE.text.muted} />
            </Pressable>
          </View>

          <Text style={styles.title} testID={`${testID}-title`}>
            {title}
          </Text>

          {message ? (
            <Text style={styles.body} testID={`${testID}-message`}>
              {message}
            </Text>
          ) : null}

          {children}

          <View style={styles.actionsColumn}>
            {confirmLabel && onConfirm ? (
              <Pressable
                style={({ pressed }) => [
                  styles.confirmButton,
                  { backgroundColor: toneConfig.confirmBg },
                  pressed && !isActionDisabled && { backgroundColor: toneConfig.confirmPressedBg },
                  isActionDisabled && styles.disabledButton,
                ]}
                onPress={onConfirm}
                disabled={isActionDisabled}
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
                accessibilityState={{ disabled: isActionDisabled, busy: loading }}
                testID={`${testID}-confirm-btn`}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={toneConfig.confirmTextColor} size="small" />
                    <Text style={[styles.confirmText, { color: toneConfig.confirmTextColor }]}>
                      {confirmLabel}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.confirmText, { color: toneConfig.confirmTextColor }]}>
                    {confirmLabel}
                  </Text>
                )}
              </Pressable>
            ) : null}

            {cancelLabel ? (
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  isBusy && styles.disabledButton,
                  pressed && !isBusy && styles.buttonPressed,
                ]}
                onPress={onCancel}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={cancelLabel}
                accessibilityState={{ disabled: isBusy }}
                testID={`${testID}-cancel-btn`}
              >
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 24,
    ...CARD_SHADOW,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
    marginTop: -6,
  },
  title: {
    fontFamily: font('semibold'),
    fontSize: 18,
    lineHeight: 24,
    color: PALETTE.text.title,
    marginBottom: 8,
  },
  body: {
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.muted,
    marginBottom: 20,
  },
  actionsColumn: {
    gap: 10,
  },
  confirmButton: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS_PILL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmText: {
    fontFamily: font('semibold'),
    fontSize: 15,
  },
  cancelButton: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS_PILL,
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelText: {
    fontFamily: font('semibold'),
    fontSize: 15,
    color: PALETTE.text.title,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
