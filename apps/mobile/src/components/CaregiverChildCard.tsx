import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse, ProfessionalAssignmentResponse } from '@nutrikids/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import { formatChildAge } from '../lib/children-api.js';
import { professionalInitials } from '../lib/professionals-api.js';
import { ChildGrowthStatus } from './ChildGrowthStatus.js';

export interface CaregiverChildCardProps {
  child: ChildResponse;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
  /**
   * Profesionales vigentes del niño. Si se pasa `onLinkProfessional`, la tarjeta muestra al pie
   * «+ Vincular profesional» (sin profesional) o al profesional vinculado (con `onOpenProfessionals`).
   */
  professionals?: readonly ProfessionalAssignmentResponse[];
  onLinkProfessional?: () => void;
  onOpenProfessionals?: () => void;
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
  professionals,
  onLinkProfessional,
  onOpenProfessionals,
}: CaregiverChildCardProps) {
  const { t } = useTranslation('caregiver');
  const { t: tCommon } = useTranslation('common');
  const childAge = formatChildAge(child.birthDate);
  const isGirl = child.sex === 'FEMALE';
  const baseTestID = testID ?? `child-card-${child.id}`;
  const firstProfessional = professionals?.[0] ?? null;
  const extraProfessionals = Math.max(0, (professionals?.length ?? 0) - 1);
  const professionalName = firstProfessional
    ? `${firstProfessional.firstName ?? ''} ${firstProfessional.lastName ?? ''}`.trim()
    : '';
  const professionalSpecialty = firstProfessional?.specialty
    ? tCommon(`specialties.${firstProfessional.specialty}`, {
        defaultValue: firstProfessional.specialty,
      })
    : '';

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.pressArea, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? t('home.seeMoreA11y', { name: child.firstName })}
        testID={baseTestID}
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

      {onLinkProfessional ? (
        firstProfessional ? (
          <Pressable
            style={({ pressed }) => [styles.professionalRow, pressed && styles.cardPressed]}
            onPress={onOpenProfessionals ?? onLinkProfessional}
            accessibilityRole="button"
            accessibilityLabel={t('myChildren.openProfessionalsA11y', { name: child.firstName })}
            testID={`${baseTestID}-professional`}
          >
            <View style={styles.professionalAvatar}>
              <Text style={styles.professionalAvatarText}>
                {professionalInitials(
                  firstProfessional.firstName ?? '',
                  firstProfessional.lastName ?? '',
                )}
              </Text>
            </View>
            <View style={styles.professionalInfo}>
              <Text style={styles.professionalName} numberOfLines={1}>
                {professionalName}
                {extraProfessionals > 0
                  ? ` ${t('myChildren.moreProfessionals', { count: extraProfessionals })}`
                  : ''}
              </Text>
              <Text style={styles.professionalMeta} numberOfLines={1}>
                {t('myChildren.professionalLinked', { specialty: professionalSpecialty })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={PALETTE.text.light} />
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && styles.cardPressed]}
            onPress={onLinkProfessional}
            accessibilityRole="button"
            accessibilityLabel={t('myChildren.linkProfessionalA11y', { name: child.firstName })}
            testID={`${baseTestID}-link-professional`}
          >
            <Ionicons name="add" size={16} color={PALETTE.primary} />
            <Text style={styles.linkButtonText}>{t('myChildren.linkProfessional')}</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.secondary,
    borderRadius: RADIUS_PILL,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  pressArea: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PALETTE.text.light,
    borderRadius: RADIUS_PILL,
    height: 40,
    marginHorizontal: 18,
    marginBottom: 18,
  },
  linkButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.primary,
  },
  professionalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.45)',
  },
  professionalAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PALETTE.text.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  professionalAvatarText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 12,
    color: PALETTE.primary,
  },
  professionalInfo: { flex: 1 },
  professionalName: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.text.light,
  },
  professionalMeta: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.light,
    opacity: 0.92,
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
