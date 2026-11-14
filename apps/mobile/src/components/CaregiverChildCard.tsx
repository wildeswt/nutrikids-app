import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse } from '@nutrikids/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import { formatChildAge } from '../lib/children-api.js';
import { ChildGrowthStatus } from './ChildGrowthStatus.js';

export interface CaregiverChildCardProps {
  child: ChildResponse;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Tarjeta naranja del niño compartida entre Inicio (niño activo) y Mis niños (lista completa).
 * Toda la tarjeta es tocable y muestra un único enlace a la derecha sin botones internos.
 */
export function CaregiverChildCard({
  child,
  onPress,
  accessibilityLabel,
  testID,
}: CaregiverChildCardProps) {
  const { t } = useTranslation('caregiver');
  const childAge = formatChildAge(child.birthDate);
  const isGirl = child.sex === 'FEMALE';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t('home.seeMoreA11y', { name: child.firstName })}
      testID={testID ?? `child-card-${child.id}`}
    >
      <View style={styles.iconWrapper}>
        <Ionicons name={isGirl ? 'woman' : 'body'} size={50} color={PALETTE.text.light} />
      </View>

      <View style={styles.infoWrapper}>
        <Text style={styles.nameTitle}>
          {t('home.childSummary', {
            name: `${child.firstName} ${child.lastName}`,
            age: childAge,
          })}
        </Text>
        <Text style={styles.subtitle}>{t('home.childSubtitle')}</Text>

        {/* Estado en lenguaje claro (texto e ícono, nunca solo color) sin puntajes z técnicos */}
        <ChildGrowthStatus childId={child.id} childName={child.firstName} />

        <View style={styles.seeMoreRow}>
          <Text style={styles.seeMoreText}>{t('home.seeMore')}</Text>
          <Ionicons name="arrow-forward" size={14} color={PALETTE.text.light} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.secondary,
    borderRadius: RADIUS_PILL,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    ...CARD_SHADOW,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  iconWrapper: {
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoWrapper: {
    flex: 1,
  },
  nameTitle: {
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontFamily: font('regular'),
    color: PALETTE.text.light,
    fontSize: 12,
    opacity: 0.92,
    marginTop: 2,
    marginBottom: 8,
  },
  seeMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  seeMoreText: {
    fontFamily: font('medium'),
    color: PALETTE.text.light,
    fontSize: 12,
    fontWeight: '500',
  },
});
