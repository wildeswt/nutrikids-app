import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { formatDecimal, formatLongDate } from '../../i18n/format.js';
import { parseCheckupSavedParams } from '../../lib/checkup-route.js';
import { formatChildAge } from '../../lib/children-api.js';

export default function CheckupSavedScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const params = useLocalSearchParams();
  const saved = parseCheckupSavedParams(params);

  const handleGoToEvolution = () => {
    router.replace({
      pathname: APP_ROUTES.CAREGIVER.EVOLUTION as never,
      params: saved ? { childId: saved.childId } : {},
    });
  };

  const handleGoToHome = () => {
    router.replace(APP_ROUTES.CAREGIVER.HOME);
  };

  if (!saved) {
    // Opened without the checkup returned by the API (for example from a deep link).
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content} testID="checkup-saved-missing">
          <Text style={styles.subtitle}>{t('checkupSaved.missing')}</Text>
          <View style={styles.spacer} />
          <View style={styles.buttonsContainer}>
            <PrimaryButton
              label={t('checkupSaved.goHome')}
              onPress={handleGoToHome}
              testID="checkup-saved-go-home"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.content}>
        {/* Ícono de éxito superior */}
        <View style={styles.successIconWrapper}>
          <Ionicons name="checkmark" size={68} color="#FFFFFF" />
        </View>

        {/* Título y subtítulo */}
        <Text style={styles.title}>{t('checkupSaved.title')}</Text>
        <Text style={styles.subtitle}>
          {t('checkupSaved.subtitle', {
            name: saved.childName,
            age: formatChildAge(saved.birthDate),
          })}
        </Text>

        {/* Bloque resumen del registro */}
        <View style={styles.summaryContainer}>
          <Text style={styles.metaDate}>
            {t('checkupSaved.lastRecord', { date: formatLongDate(saved.measuredAt) })}
          </Text>

          <View style={styles.measurementsRow}>
            {/* Peso */}
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>{t('checkupSaved.weight')}</Text>
              <Text style={styles.measurementValue}>
                {t('common:units.weightValue', { value: formatDecimal(saved.weightKg) })}
              </Text>
            </View>

            {/* Talla */}
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>{t('checkupSaved.height')}</Text>
              <Text style={styles.measurementValue}>
                {t('common:units.heightValue', { value: formatDecimal(saved.lengthHeightCm) })}
              </Text>
            </View>

            {/* Posición */}
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>{t('checkupSaved.position')}</Text>
              <Text style={styles.measurementValue}>
                {t(`addCheckup.positions.${saved.position}`)}
              </Text>
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
            <Text style={styles.noteText}>{t('checkupSaved.teamNote')}</Text>
          </View>
        </View>

        <View style={styles.spacer} />

        {/* Botones de acción inferiores */}
        <View style={styles.buttonsContainer}>
          {/* Botón primario: Ver evolución */}
          <PrimaryButton
            label={t('checkupSaved.seeEvolution')}
            onPress={handleGoToEvolution}
            testID="checkup-saved-see-evolution"
          />

          {/* Botón secundario: Volver al inicio */}
          <SecondaryButton
            label={t('checkupSaved.goHome')}
            onPress={handleGoToHome}
            testID="checkup-saved-go-home"
          />
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
    paddingHorizontal: SCREEN_MARGIN,
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
    fontFamily: font('semibold'),
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: font('medium'),
    fontSize: 16,
    fontWeight: '500',
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
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
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
    fontFamily: font('medium'),
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.primary,
    marginBottom: 4,
  },
  measurementValue: {
    fontFamily: font('semibold'),
    fontSize: 22,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border.default,
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
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
  },
  spacer: {
    flex: 1,
  },
  buttonsContainer: {
    width: '100%',
    gap: 14,
    marginTop: 20,
  },
});
