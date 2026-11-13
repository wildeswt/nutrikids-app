import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';

export default function CheckupSavedScreen() {
  const router = useRouter();

  const handleGoToEvolution = () => {
    router.replace(APP_ROUTES.CAREGIVER.EVOLUTION);
  };

  const handleGoToHome = () => {
    router.replace(APP_ROUTES.CAREGIVER.HOME);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.content}>
        {/* Ícono de éxito superior */}
        <View style={styles.successIconWrapper}>
          <Ionicons name="checkmark" size={68} color="#FFFFFF" />
        </View>

        {/* Título y subtítulo */}
        <Text style={styles.title}>¡Control guardado!</Text>
        <Text style={styles.subtitle}>Mateo - 3 años y 5 meses</Text>

        {/* Bloque resumen del registro */}
        <View style={styles.summaryContainer}>
          <Text style={styles.metaDate}>Último registro · 18 de octubre de 2026</Text>

          <View style={styles.measurementsRow}>
            {/* Peso */}
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>Peso</Text>
              <Text style={styles.measurementValue}>12,2 kg</Text>
            </View>

            {/* Talla */}
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>Talla</Text>
              <Text style={styles.measurementValue}>97,0 cm</Text>
            </View>

            {/* Posición */}
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>Posición</Text>
              <Text style={styles.measurementValue}>De pie</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Nota del equipo de salud */}
          <View style={styles.noteRow}>
            <Ionicons
              name="chatbox-outline"
              size={20}
              color={PALETTE.secondary}
              style={styles.noteIcon}
            />
            <Text style={styles.noteText}>
              Tu equipo de salud revisará este control. Te avisaremos si necesitan algo más.
            </Text>
          </View>
        </View>

        {/* Banner de sin conexión / guardado local */}
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={20} color="#C2410C" />
          <Text style={styles.offlineBannerText}>Sin conexión · se enviará al reconectar</Text>
        </View>

        <View style={styles.spacer} />

        {/* Botones de acción inferiores */}
        <View style={styles.buttonsContainer}>
          {/* Botón primario: Ver evolución */}
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={handleGoToEvolution}
            accessibilityRole="button"
            accessibilityLabel="Ver evolución"
          >
            <Text style={styles.primaryButtonText}>Ver evolución</Text>
          </Pressable>

          {/* Botón secundario: Volver al inicio */}
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleGoToHome}
            accessibilityRole="button"
            accessibilityLabel="Volver al inicio"
          >
            <Text style={styles.secondaryButtonText}>Volver al inicio</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
  },
  successIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.primary,
    marginBottom: 28,
    textAlign: 'center',
  },
  summaryContainer: {
    width: '100%',
    paddingVertical: 10,
    marginBottom: 16,
  },
  metaDate: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.text.title,
    marginBottom: 18,
  },
  measurementsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  measurementItem: {
    flex: 1,
  },
  measurementLabel: {
    fontSize: 13,
    color: PALETTE.text.muted,
    marginBottom: 4,
  },
  measurementValue: {
    fontSize: 22,
    fontWeight: '800',
    color: PALETTE.text.title,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 4,
  },
  noteIcon: {
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
  },
  offlineBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFEADF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#C2410C',
  },
  spacer: {
    flex: 1,
  },
  buttonsContainer: {
    width: '100%',
    gap: 14,
    marginTop: 20,
  },
  primaryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 28,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
  },
  secondaryButtonPressed: {
    backgroundColor: PALETTE.primaryLight,
  },
  secondaryButtonText: {
    color: PALETTE.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
