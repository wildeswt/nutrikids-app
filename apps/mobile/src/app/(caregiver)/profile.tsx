import { USER_ROLES, type ChildResponse } from '@nutrikids/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConsentChildItem } from '../../components/ConsentChildItem.js';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { fetchCaregiverChildren } from '../../lib/consent-api.js';

export { ConsentChildItem };

export default function CaregiverProfileScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const { user, activeRole, switchRole, signOut } = useAuth();
  const [children, setChildren] = useState<ChildResponse[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  useEffect(() => {
    let isMounted = true;
    async function loadChildren() {
      try {
        const list = await fetchCaregiverChildren();
        if (isMounted) setChildren(list);
      } catch {
        // En caso de que falle (ej. offline temporal), se mantiene lista vacía
      } finally {
        if (isMounted) setLoadingChildren(false);
      }
    }
    void loadChildren();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} testID="caregiver-profile-screen">
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
          <Text style={styles.label}>{t('profile.activeRole')}</Text>
          <Text style={styles.badge}>{activeRole ? t(`common:roles.${activeRole}`) : '-'}</Text>
        </View>

        {hasDualRole && (
          <Pressable
            style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            onPress={() => void switchRole(USER_ROLES.PROFESSIONAL)}
          >
            <Text style={styles.switchButtonText}>{t('profile.switchToProfessional')}</Text>
          </Pressable>
        )}

        {/* Sección de consentimientos informados por niño (Criterios NK-20) */}
        <View style={styles.sectionContainer} testID="consents-section">
          <Text style={styles.sectionTitle}>{t('profile.consentsTitle')}</Text>
          <Text style={styles.sectionDescription}>{t('profile.consentsDescription')}</Text>

          {loadingChildren ? (
            <ActivityIndicator size="small" color="#16A34A" style={styles.loader} />
          ) : children.length > 0 ? (
            children.map((child) => <ConsentChildItem key={child.id} child={child} />)
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t('profile.noChildren')}</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionContainer}>
          <LanguageSelector />
        </View>

        {/* Derechos sobre los datos (NK-55) */}
        <View style={styles.sectionContainer}>
          {(
            [
              ['myData', APP_ROUTES.CAREGIVER.MY_DATA, 'person-outline'],
              ['privacy', APP_ROUTES.CAREGIVER.PRIVACY, 'shield-checkmark-outline'],
            ] as const
          ).map(([key, route, icon]) => (
            <Pressable
              key={key}
              style={({ pressed }) => [styles.linkRow, pressed && styles.buttonPressed]}
              onPress={() => router.push(route)}
              accessibilityRole="button"
              accessibilityLabel={t(`profile.${key}`)}
              testID={`profile-link-${key}`}
            >
              <Ionicons name={icon} size={22} color="#14532D" />
              <View style={styles.linkText}>
                <Text style={styles.linkTitle}>{t(`profile.${key}`)}</Text>
                <Text style={styles.linkSubtitle}>{t(`profile.${key}Description`)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#6B7280" />
            </Pressable>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={() => void signOut()}
        >
          <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#F0FDF4',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
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
    color: '#14532D',
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
    color: '#15803D',
    backgroundColor: '#DCFCE7',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  switchButton: {
    backgroundColor: '#059669',
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
  sectionContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#14532D',
  },
  sectionDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PALETTE.input.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  linkText: {
    flex: 1,
    gap: 2,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  linkSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  loader: {
    marginVertical: 12,
  },
  emptyBox: {
    backgroundColor: PALETTE.input.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
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
    color: PALETTE.feedback.error,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
