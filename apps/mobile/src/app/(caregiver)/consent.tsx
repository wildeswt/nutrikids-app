import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { CONSENT_TEXT, CURRENT_CONSENT_VERSION } from '../../lib/consent-api.js';

export default function ConsentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    childId?: string;
    childName?: string;
    mode?: 'register' | 'view';
  }>();

  const childId = params.childId ?? null;
  const childName = params.childName ?? 'el niño/a';
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
          'Consentimiento registrado',
          `Has otorgado el consentimiento informado (versión ${CURRENT_CONSENT_VERSION}) exitosamente.`,
          [{ text: 'Aceptar', onPress: () => router.replace(APP_ROUTES.CAREGIVER.PROFILE) }],
        );
      } catch (err) {
        Alert.alert(
          'Error',
          err instanceof Error ? err.message : 'No se pudo registrar el consentimiento.',
        );
      }
    } else {
      // Flujo pre-registro: Se acepta el consentimiento antes de ingresar los datos del niño
      Alert.alert(
        'Consentimiento aceptado',
        `Has aceptado el consentimiento informado (versión ${CURRENT_CONSENT_VERSION}). Ahora puedes continuar con el registro del niño.`,
        [
          {
            text: 'Continuar al registro',
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

    Alert.alert(
      'Revocar consentimiento',
      `¿Estás seguro de que deseas revocar el consentimiento para ${childName}? No se podrán registrar nuevos controles de crecimiento hasta que otorgues un nuevo consentimiento.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, revocar',
          style: 'destructive',
          onPress: async () => {
            try {
              await revoke();
              Alert.alert(
                'Consentimiento revocado',
                'El consentimiento ha sido revocado. El historial previo se mantiene para fines de auditoría.',
                [
                  {
                    text: 'Entendido',
                    onPress: () => router.replace(APP_ROUTES.CAREGIVER.PROFILE),
                  },
                ],
              );
            } catch (err) {
              Alert.alert(
                'Error al revocar',
                err instanceof Error ? err.message : 'No se pudo revocar el consentimiento.',
              );
            }
          },
        },
      ],
    );
  };

  const displayedVersion = consent?.textVersion ?? CURRENT_CONSENT_VERSION;
  const textBody = CONSENT_TEXT[displayedVersion] ?? CONSENT_TEXT[CURRENT_CONSENT_VERSION];

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return `${d.toLocaleDateString('es-CL')} a las ${d.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  const isActionLoading = status === 'loading';

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} testID="consent-screen">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Consentimiento Informado</Text>
          <Text style={styles.subtitle}>
            {mode === 'register'
              ? 'Términos y condiciones para el registro del niño'
              : `Estado del consentimiento de ${childName}`}
          </Text>
        </View>

        {/* Metadata de versión y fecha si ya existe consentimiento */}
        {consent && (
          <View style={styles.metaContainer} testID="consent-metadata">
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Versión aceptada:</Text>
              <Text style={styles.versionBadge}>{consent.textVersion}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Fecha de otorgamiento:</Text>
              <Text style={styles.metaValue}>{formatDate(consent.grantedAt)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Estado actual:</Text>
              <Text
                style={[
                  styles.statusBadge,
                  consent.revokedAt ? styles.statusRevoked : styles.statusActive,
                ]}
              >
                {consent.revokedAt ? 'REVOCADO' : 'VIGENTE'}
              </Text>
            </View>

            {consent.revokedAt && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Fecha de revocación:</Text>
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
                <Text style={styles.primaryButtonText}>Aceptar consentimiento</Text>
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
                <Text style={styles.revokeButtonText}>Revocar consentimiento</Text>
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
                <Text style={styles.primaryButtonText}>Otorgar consentimiento nuevamente</Text>
              )}
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
            onPress={() => router.back()}
            testID="back-button"
          >
            <Text style={styles.secondaryButtonText}>Volver</Text>
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
