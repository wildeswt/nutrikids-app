import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../constants/colors.js';

export interface ChildBannerProps {
  /** Nombre completo del niño (o de la persona de contexto de la pantalla). */
  name: string;
  /** Segunda línea: edad, fecha de registro, representante legal, etc. */
  subtitle?: string | undefined;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}

/**
 * Banner naranja de contexto: indica de qué niño trata la pantalla. Es el mismo bloque de las
 * pantallas de Alimentación, Nuevo control y Evolución del diseño (72 px, sin foto ni avatar,
 * porque la app no guarda fotos de los niños).
 */
export function ChildBanner({ name, subtitle, style, testID, children }: ChildBannerProps) {
  return (
    <View style={[styles.banner, style]} testID={testID ?? 'child-banner'}>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 25,
    minHeight: 72,
    paddingHorizontal: 24,
    paddingVertical: 14,
    justifyContent: 'center',
    gap: 4,
  },
  name: {
    color: PALETTE.text.light,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: PALETTE.text.light,
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.92,
  },
});
