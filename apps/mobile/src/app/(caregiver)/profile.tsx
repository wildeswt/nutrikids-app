import { USER_ROLES, type ChildResponse } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
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
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { useConsent } from '../../hooks/useConsent.js';
import { fetchCaregiverChildren } from '../../lib/consent-api.js';

interface ConsentChildItemProps {
  child: ChildResponse;
}

export function ConsentChildItem({ child }: ConsentChildItemProps) {
  const router = useRouter();
  const { status, consent, error, revoke } = useConsent(child.id);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('es-CL');
  };

  const handleRevoke = () => {
    Alert.alert(
      'Revocar consentimiento',
      `¿Deseas revocar el consentimiento informado de ${child.firstName} ${child.lastName}? No se podrán ingresar nuevos controles de salud hasta renovarlo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revocar',
          style: 'destructive',
          onPress: async () => {
            try {
              await revoke();
              Alert.alert('Éxito', 'El consentimiento ha sido revocado correctamente.');
            } catch (err) {
              Alert.alert(
                'Error al revocar',
                err instanceof Error ? err.message : 'No se pudo revocar.',
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
          <Text style={[styles.badgeBase, styles.badgeActive]}>VIGENTE</Text>
        ) : consent?.revokedAt ? (
          <Text style={[styles.badgeBase, styles.badgeRevoked]}>REVOCADO</Text>
        ) : (
          <Text style={[styles.badgeBase, styles.badgeNone]}>SIN CONSENTIMIENTO</Text>
        )}
      </View>

      {error && <Text style={styles.itemErrorText}>{error}</Text>}

      {consent && !consent.revokedAt && (
        <View style={styles.consentDetails}>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>Versión aceptada: </Text>
            {consent.textVersion}
          </Text>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>Fecha: </Text>
            {formatDate(consent.grantedAt)}
          </Text>
        </View>
      )}

      {consent?.revokedAt && (
        <View style={styles.consentDetails}>
          <Text style={styles.consentDetailText}>
            <Text style={styles.detailLabel}>Revocado el: </Text>
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
          <Text style={styles.actionButtonOutlineText}>Ver documento</Text>
        </Pressable>

        {consent && !consent.revokedAt && (
          <Pressable
            style={({ pressed }) => [styles.actionButtonRevoke, pressed && styles.buttonPressed]}
            onPress={handleRevoke}
            testID={`revoke-consent-${child.id}`}
          >
            <Text style={styles.actionButtonRevokeText}>Revocar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function CaregiverProfileScreen() {
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
        <Text style={styles.title}>Mi Perfil</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Nombre:</Text>
          <Text style={styles.value}>
            {user?.firstName} {user?.lastName}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Correo:</Text>
          <Text style={styles.value}>{user?.email}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Perfil activo:</Text>
          <Text style={styles.badge}>{activeRole}</Text>
        </View>

        {hasDualRole && (
          <Pressable
            style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            onPress={() => void switchRole(USER_ROLES.PROFESSIONAL)}
          >
            <Text style={styles.switchButtonText}>Cambiar a vista Profesional</Text>
          </Pressable>
        )}

        {/* Sección de consentimientos informados por niño (Criterios NK-20) */}
        <View style={styles.sectionContainer} testID="consents-section">
          <Text style={styles.sectionTitle}>Consentimientos Informados</Text>
          <Text style={styles.sectionDescription}>
            Gestiona la autorización de tratamiento de datos y seguimiento nutricional de tus
            hijos/as.
          </Text>

          {loadingChildren ? (
            <ActivityIndicator size="small" color="#16A34A" style={styles.loader} />
          ) : children.length > 0 ? (
            children.map((child) => <ConsentChildItem key={child.id} child={child} />)
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No tienes niños registrados actualmente. Al registrar un niño se solicitará el
                consentimiento informado previo.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Nota: La gestión de datos personales y portabilidad se integrará en NK-41.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={() => void signOut()}
        >
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
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
