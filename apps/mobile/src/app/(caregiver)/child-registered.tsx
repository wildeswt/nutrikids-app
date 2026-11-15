import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { parseChildRegisteredParams } from '../../lib/child-registered-route.js';
import { formatChildAge } from '../../lib/children-api.js';

/** Pantalla posterior al alta del niño: ofrece vincular a su profesional o dejarlo para después. */
export default function ChildRegisteredScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const params = useLocalSearchParams();
  const registered = parseChildRegisteredParams(params);

  const goHome = () => router.replace(APP_ROUTES.CAREGIVER.HOME as never);

  const goLink = () => {
    if (!registered) return goHome();
    router.replace({
      pathname: APP_ROUTES.CAREGIVER.LINK_PROFESSIONAL as never,
      params: { childId: registered.childId },
    });
  };

  if (!registered) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content} testID="child-registered-missing">
          <Text style={styles.subtitle}>{t('childRegistered.missing')}</Text>
          <View style={styles.spacer} />
          <View style={styles.buttons}>
            <PrimaryButton
              label={t('childRegistered.goHome')}
              onPress={goHome}
              testID="child-registered-go-home"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right', 'bottom']}
      testID="caregiver-child-registered-screen"
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={68} color={PALETTE.text.light} />
        </View>

        <Text style={styles.title}>{t('childRegistered.title')}</Text>
        <Text style={styles.subtitle} testID="child-registered-subtitle">
          {t('childRegistered.subtitle', {
            name: registered.childName,
            age: formatChildAge(registered.birthDate),
          })}
        </Text>

        <Card style={styles.card} testID="child-registered-link-card">
          <Ionicons name="person-add-outline" size={26} color={PALETTE.primary} />
          <Text style={styles.cardTitle}>{t('childRegistered.cardTitle')}</Text>
          <Text style={styles.cardBody}>
            {t('childRegistered.cardBody', { name: registered.childName })}
          </Text>
        </Card>

        <Text style={styles.note}>{t('childRegistered.later')}</Text>

        <View style={styles.spacer} />

        <View style={styles.buttons}>
          <PrimaryButton
            label={t('childRegistered.link')}
            onPress={goLink}
            testID="child-registered-link"
          />
          <SecondaryButton
            label={t('childRegistered.notNow')}
            onPress={goHome}
            testID="child-registered-not-now"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 48,
    paddingBottom: 24,
    alignItems: 'center',
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
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
  card: { width: '100%', gap: 8, padding: 18 },
  cardTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.text.title,
  },
  cardBody: {
    fontFamily: font('regular'),
    fontSize: 13,
    lineHeight: 19,
    color: PALETTE.text.body,
  },
  note: {
    alignSelf: 'flex-start',
    marginTop: 18,
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  spacer: { flex: 1, minHeight: 24 },
  buttons: { width: '100%', alignItems: 'center', gap: 14 },
});
