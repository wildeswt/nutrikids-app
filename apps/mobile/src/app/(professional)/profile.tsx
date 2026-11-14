import { USER_ROLES } from '@nutrikids/shared';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { useAuth } from '../../context/auth-context.js';

export default function ProfessionalProfileScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const { user, activeRole, switchRole, signOut } = useAuth();

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
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
          <Pressable
            style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            onPress={() => void switchRole(USER_ROLES.CAREGIVER)}
          >
            <Text style={styles.switchButtonText}>{t('profile.switchToCaregiver')}</Text>
          </Pressable>
        )}

        <LanguageSelector />

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={() => void signOut()}
        >
          <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#065F46',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  value: {
    fontSize: 14,
    color: '#111827',
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#D1FAE5',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  switchButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  switchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
