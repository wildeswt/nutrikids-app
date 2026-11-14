import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { APP_ROUTES } from '../../constants/routes.js';
import { useConsent } from '../../hooks/useConsent.js';
import { formatNumericDate, formatTime } from '../../i18n/format.js';
import { CURRENT_CONSENT_VERSION, getConsentText } from '../../lib/consent-api.js';

export default function ConsentScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation(['consent', 'common']);
  const params = useLocalSearchParams<{
    childId?: string;
    childName?: string;
    mode?: 'register' | 'view';
  }>();

  const childId = params.childId ?? null;
  const childName = params.childName ?? t('screen.childFallback');
  const mode = params.mode ?? (childId ? 'view' : 'register');

  const { status, consent, error, load, grant, revoke } = useConsent(childId);

  useEffect(() => {
    if (childId && mode === 'view') {
      void load();
    }
  }, [childId, mode, load]);

  const handleAcceptConsent = async () => {
    if (childId) {
      try {
        await grant(CURRENT_CONSENT_VERSION);
        Alert.alert(
          t('alerts.grantedTitle'),
          t('alerts.grantedMessage', { version: CURRENT_CONSENT_VERSION }),
          [
            {
              text: t('common:actions.accept'),
              onPress: () => router.replace(APP_ROUTES.CAREGIVER.PROFILE),
            },
          ],
        );
      } catch (err) {
        Alert.alert(
          t('alerts.errorTitle'),
          err instanceof Error ? err.message : t('alerts.grantError'),
        );
      }
    } else {
      // Flujo pre-registro: Se acepta el consentimiento antes de ingresar los datos del niño
      Alert.alert(
        t('alerts.acceptedTitle'),
        t('alerts.acceptedMessage', { version: CURRENT_CONSENT_VERSION }),
        [
          {
            text: t('alerts.continueToRegister'),
            onPress: () => {
              // Navega de regreso al inicio o al flujo de registro de niños con consentimiento aceptado
              router.replace(APP_ROUTES.CAREGIVER.HOME);
            },
          },
        ],
      );
    }
  };

  const handleRevokeConsent = () => {
    if (!childId) return;

    Alert.alert(t('alerts.revokeTitle'), t('alerts.revokeMessage', { name: childName }), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      {
        text: t('alerts.revokeConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await revoke();
            Alert.alert(t('alerts.revokedTitle'), t('alerts.revokedMessage'), [
              {
                text: t('common:actions.understood'),
                onPress: () => router.replace(APP_ROUTES.CAREGIVER.PROFILE),
              },
            ]);
          } catch (err) {
            Alert.alert(
              t('alerts.revokeErrorTitle'),
              err instanceof Error ? err.message : t('alerts.revokeError'),
            );
          }
        },
      },
    ]);
  };

  const displayedVersion = consent?.textVersion ?? CURRENT_CONSENT_VERSION;
  const textBody = getConsentText(displayedVersion);
  // The legal text is only published in the languages where it was reviewed; otherwise it is
  // shown in Spanish and the caregiver is told so.
  const isDocumentTranslated = Boolean(
    i18n.getResource(i18n.language, 'consent', `documents.${displayedVersion}`),
  );

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return t('common:time.dateAtTime', { date: formatNumericDate(d), time: formatTime(d) });
  };

  const isActionLoading = status === 'loading';

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} testID="consent-screen">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('screen.title')}</Text>
          <Text style={styles.subtitle}>
            {mode === 'register'
              ? t('screen.registerSubtitle')
              : t('screen.viewSubtitle', { name: childName })}
          </Text>
        </View>

        {/* Metadata de versión y fecha si ya existe consentimiento */}
        {consent && (
          <View style={styles.metaContainer} testID="consent-metadata">
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('screen.versionLabel')}</Text>
              <Text style={styles.versionBadge}>{consent.textVersion}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('screen.grantedAtLabel')}</Text>
              <Text style={styles.metaValue}>{formatDate(consent.grantedAt)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('screen.statusLabel')}</Text>
              <Text
                style={[
                  styles.statusBadge,
                  consent.revokedAt ? styles.statusRevoked : styles.statusActive,
                ]}
              >
                {consent.revokedAt ? t('screen.statusRevoked') : t('screen.statusActive')}
              </Text>
            </View>

            {consent.revokedAt && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('screen.revokedAtLabel')}</Text>
                <Text style={styles.metaValue}>{formatDate(consent.revokedAt)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Notificación de error si ocurre */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Texto del consentimiento en lenguaje claro */}
        <View style={styles.textContainer}>
          {!isDocumentTranslated && (
            <Text style={styles.documentLanguageNotice}>{t('screen.documentInSpanish')}</Text>
          )}
          <Text style={styles.textBody}>{textBody}</Text>
        </View>

        {/* Acciones según el modo y estado */}
        <View style={styles.actionsContainer}>
          {mode === 'register' && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isActionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handleAcceptConsent()}
              disabled={isActionLoading}
              testID="accept-consent-button"
            >
              {isActionLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('screen.accept')}</Text>
              )}
            </Pressable>
          )}

          {mode === 'view' && consent && !consent.revokedAt && (
            <Pressable
              style={({ pressed }) => [
                styles.revokeButton,
                pressed && styles.buttonPressed,
                isActionLoading && styles.buttonDisabled,
              ]}
              onPress={handleRevokeConsent}
              disabled={isActionLoading}
              testID="revoke-consent-button"
            >
              {isActionLoading ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <Text style={styles.revokeButtonText}>{t('screen.revoke')}</Text>
              )}
            </Pressable>
          )}

          {mode === 'view' && consent?.revokedAt && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isActionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handleAcceptConsent()}
              disabled={isActionLoading}
              testID="renew-consent-button"
            >
              {isActionLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('screen.renew')}</Text>
              )}
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
            onPress={() => router.back()}
            testID="back-button"
          >
            <Text style={styles.secondaryButtonText}>{t('screen.back')}</Text>
          </Pressable>
        </View>
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
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#14532D',
  },
  subtitle: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 4,
  },
  metaContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  metaValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  versionBadge: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  statusActive: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
  },
  statusRevoked: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  documentLanguageNotice: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#B45309',
    marginBottom: 8,
  },
  textContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 280,
  },
  textBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#334155',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
  },
  actionsContainer: {
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  revokeButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1.5,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
