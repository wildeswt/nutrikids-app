import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { useConsent } from '../../hooks/useConsent.js';
import { CONSENT_TEXT, CURRENT_CONSENT_VERSION } from '../../lib/consent-api.js';

export default function ConsentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    childId?: string;
    childName?: string;
    mode?: 'register' | 'view';
  }>();

  const childId = params.childId ?? null;
  const childName = params.childName ?? 'tu hijo o hija';
  const mode = params.mode ?? (childId ? 'view' : 'register');

  const { status, consent, error, load, grant, revoke } = useConsent(childId);

  const [isLegalRepresentative, setIsLegalRepresentative] = useState(false);
  const [understandsRevocation, setUnderstandsRevocation] = useState(false);
  const [showFullText, setShowFullText] = useState(false);

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
              // Navega a la pantalla de alta de datos del niño tras aceptar consentimiento
              router.replace(APP_ROUTES.CAREGIVER.ADD_CHILD as never);
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

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME as never);
    }
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
  const isGranting = mode === 'register' || (mode === 'view' && Boolean(consent?.revokedAt));
  const canGrant = isLegalRepresentative && understandsRevocation;
  const caregiverName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} testID="consent-screen">
      {/* Botón superior Volver */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          onPress={handleBack}
          hitSlop={8}
          testID="back-button"
          accessibilityRole="button"
          accessibilityLabel="Volver a la pantalla anterior"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backButtonText}>Volver</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>Consentimiento</Text>

        {mode === 'register' ? (
          <Text style={styles.screenSubtitle}>
            Antes de registrar a tu hijo o hija necesitamos tu autorización para cuidar sus datos.
          </Text>
        ) : (
          <View style={styles.childBlock}>
            <Text style={styles.childName}>{childName}</Text>
            {caregiverName ? (
              <Text style={styles.childRepresentative}>Representante legal: {caregiverName}</Text>
            ) : null}
          </View>
        )}

        {/* Metadata de versión y fecha si ya existe consentimiento */}
        {consent && (
          <View style={styles.metaCard} testID="consent-metadata">
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
            <Ionicons name="alert-circle" size={20} color={PALETTE.feedback.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ¿Qué autorizas? */}
        <View style={styles.authorizeHeader}>
          <View style={styles.shieldCircle}>
            <Ionicons name="shield-checkmark" size={22} color={PALETTE.secondary} />
          </View>
          <Text style={styles.sectionTitle}>¿Qué autorizas?</Text>
        </View>

        <View style={styles.bulletList}>
          <View style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Ionicons name="checkmark" size={14} color={PALETTE.primary} />
            </View>
            <Text style={styles.bulletText}>
              Guardar el peso, la talla y la alimentación de {childName}.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Ionicons name="checkmark" size={14} color={PALETTE.primary} />
            </View>
            <Text style={styles.bulletText}>
              Calcular su crecimiento con los estándares de la OMS.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Ionicons name="checkmark" size={14} color={PALETTE.primary} />
            </View>
            <Text style={styles.bulletText}>
              Compartir estos datos solo con su equipo de salud asignado.
            </Text>
          </View>
        </View>

        {/* Texto completo del consentimiento (desplegable) */}
        <Pressable
          style={({ pressed }) => [styles.readMoreRow, pressed && styles.buttonPressed]}
          onPress={() => setShowFullText((prev) => !prev)}
          testID="toggle-consent-text"
          accessibilityRole="button"
          accessibilityState={{ expanded: showFullText }}
          accessibilityLabel="Leer el texto completo del consentimiento"
        >
          <Text style={styles.readMoreText}>
            {showFullText ? 'Ocultar el texto completo' : 'Leer el texto completo'}
          </Text>
          <Ionicons
            name={showFullText ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={PALETTE.primary}
          />
        </Pressable>

        {showFullText && (
          <View style={styles.fullTextCard} testID="consent-full-text">
            <Text style={styles.fullTextBody}>{textBody}</Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Confirmaciones del representante legal */}
        {isGranting && (
          <View style={styles.checkboxGroup}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setIsLegalRepresentative((prev) => !prev)}
              testID="legal-representative-checkbox"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isLegalRepresentative }}
              accessibilityLabel="Soy el representante legal y autorizo el tratamiento de datos"
            >
              <View
                style={[styles.checkboxBox, isLegalRepresentative && styles.checkboxBoxChecked]}
              >
                {isLegalRepresentative && (
                  <Ionicons name="checkmark" size={16} color={PALETTE.text.light} />
                )}
              </View>
              <Text style={styles.checkboxLabel}>
                Soy el representante legal de {childName} y autorizo el tratamiento de sus datos de
                salud.
              </Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setUnderstandsRevocation((prev) => !prev)}
              testID="understands-revocation-checkbox"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: understandsRevocation }}
              accessibilityLabel="Entiendo que puedo revocar este consentimiento"
            >
              <View
                style={[styles.checkboxBox, understandsRevocation && styles.checkboxBoxChecked]}
              >
                {understandsRevocation && (
                  <Ionicons name="checkmark" size={16} color={PALETTE.text.light} />
                )}
              </View>
              <Text style={styles.checkboxLabel}>
                Entiendo que puedo revocar este consentimiento cuando quiera desde mi perfil.
              </Text>
            </Pressable>
          </View>
        )}

        {/* Acciones según el modo y estado */}
        <View style={styles.actionsContainer}>
          {mode === 'register' && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                (isActionLoading || !canGrant) && styles.buttonDisabled,
              ]}
              onPress={() => void handleAcceptConsent()}
              disabled={isActionLoading || !canGrant}
              testID="accept-consent-button"
              accessibilityRole="button"
              accessibilityLabel="Acepto y continuar"
            >
              {isActionLoading ? (
                <ActivityIndicator color={PALETTE.text.light} />
              ) : (
                <Text style={styles.primaryButtonText}>Acepto y continuar</Text>
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
              accessibilityRole="button"
              accessibilityLabel="Revocar consentimiento"
            >
              {isActionLoading ? (
                <ActivityIndicator color={PALETTE.feedback.error} />
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
                (isActionLoading || !canGrant) && styles.buttonDisabled,
              ]}
              onPress={() => void handleAcceptConsent()}
              disabled={isActionLoading || !canGrant}
              testID="renew-consent-button"
              accessibilityRole="button"
              accessibilityLabel="Otorgar consentimiento nuevamente"
            >
              {isActionLoading ? (
                <ActivityIndicator color={PALETTE.text.light} />
              ) : (
                <Text style={styles.primaryButtonText}>Otorgar consentimiento nuevamente</Text>
              )}
            </Pressable>
          )}

          {isGranting && (
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              onPress={handleBack}
              testID="decline-consent-button"
              accessibilityRole="button"
              accessibilityLabel="Ahora no"
            >
              <Text style={styles.secondaryButtonText}>Ahora no</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 6,
  },
  screenSubtitle: {
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
    marginBottom: 20,
  },
  childBlock: {
    marginBottom: 20,
    gap: 4,
  },
  childName: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.primary,
  },
  childRepresentative: {
    fontSize: 14,
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  metaCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    gap: 10,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  metaValue: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.text.title,
    textAlign: 'right',
  },
  versionBadge: {
    backgroundColor: PALETTE.primaryLight,
    color: PALETTE.primary,
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusActive: {
    backgroundColor: PALETTE.primaryLight,
    color: PALETTE.primary,
  },
  statusRevoked: {
    backgroundColor: PALETTE.feedback.errorBg,
    color: PALETTE.feedback.error,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: PALETTE.feedback.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  authorizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  shieldCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PALETTE.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.text.title,
  },
  bulletList: {
    gap: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: PALETTE.text.body,
  },
  readMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
  },
  readMoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  fullTextCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    marginTop: 8,
  },
  fullTextBody: {
    fontSize: 13,
    lineHeight: 20,
    color: PALETTE.text.body,
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border.default,
    marginVertical: 20,
  },
  checkboxGroup: {
    gap: 14,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: PALETTE.border.default,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
  },
  actionsContainer: {
    gap: 12,
    marginTop: 24,
  },
  primaryButton: {
    height: 52,
    backgroundColor: PALETTE.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.text.light,
  },
  secondaryButton: {
    height: 52,
    backgroundColor: PALETTE.background,
    borderColor: PALETTE.primary,
    borderWidth: 2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  revokeButton: {
    height: 52,
    backgroundColor: PALETTE.background,
    borderColor: PALETTE.feedback.error,
    borderWidth: 2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.feedback.error,
  },
});
