import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/auth-context.js';

export default function AlertsInboxScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Bandeja de Alertas Nutricionales</Text>
        <Text style={styles.subtitle}>
          Bienvenido, Dr./a. {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.description}>
          Pantalla de inicio del Profesional de Salud. Aquí se listarán las alertas activas
          (PENDING_REVIEW y GENERATED) priorizadas por gravedad. La vista interactiva se implementa
          en NK-32.
        </Text>
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
    gap: 12,
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
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#059669',
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
});
