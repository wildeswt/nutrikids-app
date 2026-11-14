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
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          testID={`${testID}-back`}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
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
