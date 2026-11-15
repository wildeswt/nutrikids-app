import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { ActionModal, type ActionModalItem } from './ActionModal.js';

export interface CardMenuButtonProps {
  actions: ActionModalItem[];
  /** Título y subtítulo de la hoja de acciones (p. ej. nombre del niño). */
  title?: string;
  subtitle?: string;
  accessibilityLabel: string;
  /** `light` sobre tarjetas de color (icono blanco); `dark` sobre tarjetas blancas. */
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Botón de tres puntos para las tarjetas: abre la hoja de acciones (ActionModal) con las
 * operaciones de esa tarjeta. Cierra la hoja antes de ejecutar la acción elegida.
 */
export function CardMenuButton({
  actions,
  title,
  subtitle,
  accessibilityLabel,
  tone = 'dark',
  style,
  testID = 'card-menu-button',
}: CardMenuButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          tone === 'light' ? styles.buttonLight : styles.buttonDark,
          pressed && styles.pressed,
          style,
        ]}
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <Ionicons
          name="ellipsis-vertical"
          size={18}
          color={tone === 'light' ? PALETTE.text.light : PALETTE.text.muted}
        />
      </Pressable>
      <ActionModal
        visible={open}
        {...(title ? { title } : {})}
        {...(subtitle ? { subtitle } : {})}
        actions={actions.map((action) => ({
          ...action,
          onPress: () => {
            setOpen(false);
            action.onPress();
          },
        }))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLight: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  buttonDark: {
    backgroundColor: PALETTE.background,
  },
  pressed: {
    opacity: 0.8,
  },
});
