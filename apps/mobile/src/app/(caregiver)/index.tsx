import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/auth-context.js';

export default function CaregiverHomeScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>¡Hola, {user?.firstName ?? 'Cuidador'}!</Text>
        <Text style={styles.subtitle}>Inicio del Cuidador — Mis Niños</Text>
        <Text style={styles.description}>
          Aquí se listarán los niños asociados para consultar su estado nutricional. La gestión de
          niños y consentimientos se implementa en NK-21.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
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
    color: '#14532D',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#15803D',
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
});
