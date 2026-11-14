import { USER_ROLES, type ChildResponse } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LanguageSelector } from '../../components/LanguageSelector.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { useConsent } from '../../hooks/useConsent.js';
import { formatNumericDate } from '../../i18n/format.js';
import { fetchCaregiverChildren } from '../../lib/consent-api.js';

interface ConsentChildItemProps {
  child: ChildResponse;
}

export function ConsentChildItem({ child }: ConsentChildItemProps) {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const { status, consent, error, revoke } = useConsent(child.id);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    return formatNumericDate(new Date(isoString));
  };

  const handleRevoke = () => {
    Alert.alert(
      t('consentItem.revokeTitle'),
      t('consentItem.revokeMessage', { name: `${child.firstName} ${child.lastName}` }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('consentItem.revokeConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await revoke();
              Alert.alert(
                t('consentItem.revokeSuccessTitle'),
                t('consentItem.revokeSuccessMessage'),
              );
            } catch (err) {
              Alert.alert(
                t('consentItem.revokeErrorTitle'),
                err instanceof Error ? err.message : t('consentItem.revokeErrorMessage'),
              );
            }
          },
        },
      ],
    );
  };

  const handleView = () => {
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT,
      params: {
        childId: child.id,
        childName: `${child.firstName} ${child.lastName}`,
        mode: 'view',
      },
    });
  };

  return (
    <View style={styles.childConsentCard} testID={`consent-child-${child.id}`}>
      <View style={styles.childHeader}>
        <Text style={styles.childName}>
          {child.firstName} {child.lastName}
        </Text>
        {status === 'loading' ? (
          <ActivityIndicator size="small" color="#16A34A" />
        ) : consent && !consent.revokedAt ? (
          <Text style={[styles.badgeBase, styles.badgeActive]}>{t('consentItem.badgeActive')}</Text>
        ) : consent?.revokedAt ? (
          <Text style={[styles.badgeBase, styles.badgeRevoked]}>
            {t('consentItem.badgeRevoked')}
          </Text>
        ) : (
          <Text style={[styles.badgeBase, styles.badgeNone]}>{t('consentItem.badgeNone')}</Text>
        )}
      </View>

      {error && <Text style={styles.itemErrorText}>{error}</Text>}

      {consent && !consent.revokedAt && (
        <View style={styles.consentDetails}>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>{t('consentItem.version')}</Text>
            {consent.textVersion}
          </Text>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>{t('consentItem.date')}</Text>
            {formatDate(consent.grantedAt)}
          </Text>
        </View>
      )}

      {consent?.revokedAt && (
        <View style={styles.consentDetails}>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>{t('consentItem.revokedOn')}</Text>
            {formatDate(consent.revokedAt)}
          </Text>
        </View>
      )}

      <View style={styles.childActionsRow}>
        <Pressable
          style={({ pressed }) => [styles.actionButtonOutline, pressed && styles.buttonPressed]}
          onPress={handleView}
          testID={`view-consent-${child.id}`}
        >
          <Text style={styles.actionButtonOutlineText}>{t('consentItem.viewDocument')}</Text>
        </Pressable>

        {consent && !consent.revokedAt && (
          <Pressable
            style={({ pressed }) => [styles.actionButtonRevoke, pressed && styles.buttonPressed]}
            onPress={handleRevoke}
            testID={`revoke-consent-${child.id}`}
          >
            <Text style={styles.actionButtonRevokeText}>{t('consentItem.revoke')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function CaregiverProfileScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
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

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{t('profile.dataNote')}</Text>
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
  loader: {
    marginVertical: 12,
  },
  childConsentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 8,
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  childName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  badgeBase: {
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
  },
  badgeRevoked: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  badgeNone: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  consentDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  consentDetailText: {
    fontSize: 12,
    color: '#4B5563',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#374151',
  },
  itemErrorText: {
    fontSize: 11,
    color: '#DC2626',
  },
  childActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  actionButtonOutline: {
    borderColor: '#D1D5DB',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  actionButtonOutlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  actionButtonRevoke: {
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  actionButtonRevokeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  emptyBox: {
    backgroundColor: '#F9FAFB',
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
  noteBox: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  noteText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
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
