import { USER_ROLES } from '@nutrikids/shared';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { TwoFactorCard } from '../../components/TwoFactorCard.js';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_HEIGHT, BUTTON_WIDTH, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';

export default function ProfessionalProfileScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const { user, activeRole, switchRole, signOut } = useAuth();

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>{t('profile.title')}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t('profile.name')}</Text>
          <Text style={styles.value}>
            {user?.firstName} {user?.lastName}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t('profile.email')}</Text>
          <Text style={styles.value}>{user?.email}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t('profile.specialty')}</Text>
          <Text style={styles.value}>
            {user?.specialty ? t(`common:specialties.${user.specialty}`) : t('profile.noSpecialty')}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t('profile.activeRole')}</Text>
          <Text style={styles.badge}>{activeRole ? t(`common:roles.${activeRole}`) : '-'}</Text>
        </View>

        {hasDualRole && (
          <PrimaryButton
            label={t('profile.switchToCaregiver')}
            onPress={() => void switchRole(USER_ROLES.CAREGIVER)}
            style={styles.switchButton}
          />
        )}

        <TwoFactorCard />

        <LanguageSelector />

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={() => void signOut()}
        >
          <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: PALETTE.background,
    paddingHorizontal: SCREEN_MARGIN,
    paddingVertical: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    gap: 14,
  },
  title: {
    fontFamily: font('semibold'),
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border.subtle,
    paddingBottom: 8,
  },
  label: {
    fontFamily: font('medium'),
    fontSize: 14,
    fontWeight: '500',
    color: PALETTE.text.muted,
  },
  value: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
  },
  badge: {
    fontFamily: font('semibold'),
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.primary,
    backgroundColor: PALETTE.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  switchButton: {
    marginTop: 6,
  },
  logoutButton: {
    width: '100%',
    maxWidth: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    alignSelf: 'center',
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: RADIUS_PILL,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 6,
  },
  logoutButtonText: {
    fontFamily: font('semibold'),
    color: PALETTE.feedback.error,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
