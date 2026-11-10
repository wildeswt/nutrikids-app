import { USER_ROLES, type HealthResponse } from '@nutrikids/shared';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth-context.js';
import { API_BASE_URL, fetchHealth } from '../../lib/api.js';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);

  const checkHealth = useCallback(async () => {
    setLoadingHealth(true);
    setError(null);
    try {
      const result = await fetchHealth();
      setHealth(result);
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'No se pudo conectar con la API');
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  // Demo sign-in helpers to easily test role-based routing until NK-19 login form is built.
  const handleDemoCaregiverLogin = async () => {
    await signIn({
      requiresTwoFactor: false,
      accessToken: 'demo-caregiver-access-token',
      refreshToken: 'demo-caregiver-refresh-token',
      expiresIn: 3600,
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'caregiver@example.com',
        firstName: 'María',
        lastName: 'Pérez',
        roles: [USER_ROLES.CAREGIVER],
        specialty: null,
      },
    });
  };

  const handleDemoProfessionalLogin = async () => {
    await signIn({
      requiresTwoFactor: false,
      accessToken: 'demo-prof-access-token',
      refreshToken: 'demo-prof-refresh-token',
      expiresIn: 3600,
      user: {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'dr.sanchez@example.com',
        firstName: 'Carlos',
        lastName: 'Sánchez',
        roles: [USER_ROLES.PROFESSIONAL],
        specialty: 'pediatrics',
      },
    });
  };

  const handleDemoDualRoleLogin = async () => {
    await signIn({
      requiresTwoFactor: false,
      accessToken: 'demo-dual-access-token',
      refreshToken: 'demo-dual-refresh-token',
      expiresIn: 3600,
      user: {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'dual.user@example.com',
        firstName: 'Elena',
        lastName: 'Ríos',
        roles: [USER_ROLES.CAREGIVER, USER_ROLES.PROFESSIONAL],
        specialty: 'nutrition',
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>NutriKids</Text>
          <Text style={styles.subtitle}>Iniciar sesión / Navegación por rol</Text>
        </View>

        {/* Demo Fast Login Box */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acceso Rápido por Rol (NK-18)</Text>
          <Text style={styles.cardDescription}>
            Prueba la navegación protegida según el perfil del usuario. Los formularios completos de
            registro, login y 2FA se integran en NK-19.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            onPress={() => void handleDemoCaregiverLogin()}
          >
            <Text style={styles.primaryButtonText}>Entrar como Cuidador (Barra 5 accesos)</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
            onPress={() => void handleDemoProfessionalLogin()}
          >
            <Text style={styles.secondaryButtonText}>Entrar como Profesional (Menú Lateral)</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.buttonPressed]}
            onPress={() => void handleDemoDualRoleLogin()}
          >
            <Text style={styles.outlineButtonText}>Entrar con Rol Doble (Ambos perfiles)</Text>
          </Pressable>
        </View>

        {/* Backend Connectivity Status Box */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado de conexión con la API</Text>
          <View style={styles.statusBox}>
            {loadingHealth ? (
              <ActivityIndicator size="small" color="#16A34A" />
            ) : health?.status === 'ok' ? (
              <>
                <Text style={styles.statusOk}>API OK</Text>
                <Text style={styles.meta}>Servicio: {health.service}</Text>
                <Text style={styles.meta}>Base de datos: {health.db ?? 'n/a'}</Text>
              </>
            ) : (
              <>
                <Text style={styles.statusError}>API no disponible</Text>
                <Text style={styles.errorDetail}>{error ?? 'Estado degradado'}</Text>
              </>
            )}
          </View>
          <Text style={styles.endpoint}>Endpoint: {API_BASE_URL}/health</Text>

          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.buttonPressed]}
            onPress={() => void checkHealth()}
            disabled={loadingHealth}
          >
            <Text style={styles.outlineButtonText}>
              {loadingHealth ? 'Verificando...' : 'Reintentar conexión'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    alignItems: 'center',
  },
  header: {
    marginTop: 20,
    marginBottom: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#14532D',
  },
  subtitle: {
    fontSize: 15,
    color: '#4B5563',
    marginTop: 4,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14532D',
  },
  cardDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  statusBox: {
    minHeight: 80,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusOk: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803D',
  },
  statusError: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
  },
  meta: {
    fontSize: 13,
    color: '#374151',
  },
  errorDetail: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
  },
  endpoint: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
});
