import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';

export default function CaregiverHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const handleRegisterChild = () => {
    // Criterio NK-20: Se muestra la pantalla de consentimiento antes de registrar los datos del niño
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT,
      params: { mode: 'register' },
    });
  };

  return (
    <View style={styles.container} testID="caregiver-home-screen">
      <View style={styles.card}>
        <Text style={styles.title}>¡Hola, {user?.firstName ?? 'Cuidador'}!</Text>
        <Text style={styles.subtitle}>Inicio del Cuidador — Mis Niños</Text>
        <Text style={styles.description}>
          Aquí podrás consultar el estado nutricional de tus hijos/as, registrar controles de
          crecimiento y recibir recomendaciones de salud.
        </Text>

        <View style={styles.actionSection}>
          <Pressable
            style={({ pressed }) => [styles.registerButton, pressed && styles.buttonPressed]}
            onPress={handleRegisterChild}
            testID="start-child-registration-button"
          >
            <Text style={styles.registerButtonText}>+ Registrar nuevo niño</Text>
          </Pressable>
          <Text style={styles.consentNotice}>
            Antes de ingresar los datos del niño, te solicitaremos la lectura y aceptación del
            consentimiento informado.
          </Text>
        </View>
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
    gap: 16,
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
  actionSection: {
    marginTop: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 16,
  },
  registerButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  consentNotice: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
