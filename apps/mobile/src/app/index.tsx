import type { HealthResponse } from '@nutrikids/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL, fetchHealth } from '@/lib/api';

export default function HomeScreen() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHealth();
      setHealth(result);
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'No se pudo conectar con la API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.card}>
        <Text style={styles.title}>NutriKids App</Text>
        <Text style={styles.subtitle}>Estado de conexión con el backend</Text>

        <View style={styles.statusBox}>
          {loading ? (
            <ActivityIndicator size="large" color="#16A34A" />
          ) : health?.status === 'ok' ? (
            <>
              <Text style={styles.statusOk}>API OK ✅</Text>
              <Text style={styles.meta}>Servicio: {health.service}</Text>
              <Text style={styles.meta}>Base de datos: {health.db ?? 'n/a'}</Text>
            </>
          ) : (
            <>
              <Text style={styles.statusError}>API no disponible ❌</Text>
              <Text style={styles.errorDetail}>{error ?? 'Estado degradado'}</Text>
            </>
          )}
        </View>

        <Text style={styles.endpoint}>Endpoint: {API_BASE_URL}/health</Text>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => void checkHealth()}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Verificando...' : 'Reintentar'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#14532D',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
  },
  statusBox: {
    minHeight: 100,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusOk: {
    fontSize: 20,
    fontWeight: '700',
    color: '#15803D',
  },
  statusError: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
  },
  meta: {
    fontSize: 14,
    color: '#374151',
  },
  errorDetail: {
    fontSize: 13,
    color: '#991B1B',
    textAlign: 'center',
  },
  endpoint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
