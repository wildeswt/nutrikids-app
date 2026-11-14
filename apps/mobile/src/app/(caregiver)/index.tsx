import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import {
  DEMO_ACTIVE_CHILD,
  DEMO_CAREGIVER_NAME,
  DEMO_HOME_MESSAGE,
  DEMO_NEXT_CHECKUP,
} from '../../constants/demo-data.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { formatAge } from '../../i18n/format.js';

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation(['caregiver', 'common']);

  const caregiverName = user?.firstName || DEMO_CAREGIVER_NAME;

  const handleRegisterChild = () => {
    // Criterio NK-20: Se muestra la pantalla de consentimiento antes de registrar los datos del niño
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT,
      params: { mode: 'register' },
    });
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-home-screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header superior: Logo a la izquierda y Campana de notificaciones a la derecha */}
        <View style={styles.topHeader}>
          <Image
            source={APP_ASSETS.LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={t('common:brand.logoLabel')}
          />
          <Pressable
            style={({ pressed }) => [styles.notificationButton, pressed && styles.buttonPressed]}
            onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}
            accessibilityRole="button"
            accessibilityLabel={t('home.notifications')}
          >
            <Ionicons name="notifications" size={22} color={PALETTE.secondary} />
          </Pressable>
        </View>

        {/* Saludo personalizado */}
        <Text style={styles.greetingTitle}>{t('home.greeting', { name: caregiverName })}</Text>

        {/* Tarjeta Naranja Principal: Niño activo */}
        <View style={styles.childCard}>
          <View style={styles.childIconWrapper}>
            <Ionicons name="body" size={54} color="#FFFFFF" />
          </View>

          <View style={styles.childInfoWrapper}>
            <Text style={styles.childNameTitle}>
              {t('home.childSummary', {
                name: DEMO_ACTIVE_CHILD.firstName,
                age: formatAge(DEMO_ACTIVE_CHILD.ageMonths),
              })}
            </Text>
            <Text style={styles.childSubtitle}>{t('home.childSubtitle')}</Text>

            <View style={styles.statusPill}>
              <Ionicons name="checkmark" size={14} color={PALETTE.primary} />
              <Text style={styles.statusPillText}>{t('home.statusOk')}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.seeMoreRow, pressed && styles.buttonPressed]}
              onPress={() => router.push(APP_ROUTES.CAREGIVER.EVOLUTION)}
            >
              <Text style={styles.seeMoreText}>{t('home.seeMore')}</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Sección: Para ti */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.forYou')}</Text>
          <Pressable onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}>
            <Text style={styles.sectionLink}>{t('home.seeAll')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.whiteCard, pressed && styles.buttonPressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}
        >
          <View style={styles.messageCardRow}>
            <Ionicons
              name="chatbubble-ellipses"
              size={36}
              color={PALETTE.secondary}
              style={styles.messageIcon}
            />
            <View style={styles.messageContent}>
              <Text style={styles.messageTitle}>{t('home.messageTitle')}</Text>
              <Text style={styles.messageQuote}>
                {t('home.messageQuote', { text: DEMO_HOME_MESSAGE.content })}
              </Text>
              <Text style={styles.messageMeta}>
                {t('home.messageMeta', {
                  when: t('common:time.daysAgo', { count: DEMO_HOME_MESSAGE.daysAgo }),
                  author: DEMO_HOME_MESSAGE.authorName,
                })}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Sección: Próximo control */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.nextCheckup')}</Text>
          <Pressable onPress={() => router.push(APP_ROUTES.CAREGIVER.ADD_CHECKUP)}>
            <Text style={styles.sectionLink}>{t('home.schedule')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.controlCard, pressed && styles.buttonPressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.EVOLUTION)}
        >
          <View style={styles.controlCardRow}>
            <Ionicons name="calendar-outline" size={40} color="#FFFFFF" />
            <View style={styles.controlContent}>
              <Text style={styles.controlTitle}>{t('home.checkupTitle')}</Text>
              <Text style={styles.controlLocation}>
                {t('home.checkupPlace', {
                  place: DEMO_NEXT_CHECKUP.place,
                  time: DEMO_NEXT_CHECKUP.time,
                })}
              </Text>
              <View style={styles.controlSeeMore}>
                <Text style={styles.controlSeeMoreText}>{t('home.checkupDetails')}</Text>
                <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Sección: Aprende en casa */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.learnAtHome')}</Text>
          <Pressable>
            <Text style={styles.sectionLink}>{t('home.seeAll')}</Text>
          </Pressable>
        </View>

        <View style={styles.cardsRow}>
          {/* Card 1: Ideas de meriendas nutritivas */}
          <View style={styles.articleCard}>
            <Text style={styles.articleTitle}>{t('home.articleSnacks')}</Text>
            <View style={styles.articleFooter}>
              <Text style={styles.articleMeta}>{t('home.articleSnacksMeta')}</Text>
              <Ionicons name="nutrition" size={38} color="#DC2626" style={styles.articleIcon} />
            </View>
          </View>

          {/* Card 2: Alimentación a los 3 años */}
          <View style={styles.articleCard}>
            <Text style={styles.articleTitle}>{t('home.articleFeeding')}</Text>
            <View style={styles.articleFooter}>
              <Text style={styles.articleMeta}>{t('home.articleFeedingMeta')}</Text>
              <Ionicons
                name="restaurant"
                size={34}
                color={PALETTE.text.title}
                style={styles.articleIcon}
              />
            </View>
          </View>
        </View>

        {/* Sección NK-20: Registro de nuevo niño con consentimiento informado */}
        <View style={styles.actionSection}>
          <Pressable
            style={({ pressed }) => [styles.registerButton, pressed && styles.buttonPressed]}
            onPress={handleRegisterChild}
            testID="start-child-registration-button"
            accessibilityRole="button"
            accessibilityLabel={t('home.registerChildA11y')}
          >
            <Text style={styles.registerButtonText}>{t('home.registerChild')}</Text>
          </Pressable>
          <Text style={styles.consentNotice}>{t('home.consentNotice')}</Text>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 170,
    height: 48,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  childCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  childIconWrapper: {
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childInfoWrapper: {
    flex: 1,
  },
  childNameTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  childSubtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 2,
    marginBottom: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 8,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  seeMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  seeMoreText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.text.title,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  whiteCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  messageCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  messageIcon: {
    marginLeft: 4,
  },
  messageContent: {
    flex: 1,
    gap: 4,
  },
  messageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  messageQuote: {
    fontSize: 13,
    color: PALETTE.text.body,
    fontStyle: 'italic',
  },
  messageMeta: {
    fontSize: 11,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  controlCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  controlCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  controlContent: {
    flex: 1,
    gap: 3,
  },
  controlTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  controlLocation: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
  },
  controlSeeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  controlSeeMoreText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  articleCard: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    minHeight: 140,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  articleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: PALETTE.text.title,
    lineHeight: 20,
  },
  articleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  articleMeta: {
    fontSize: 11,
    color: PALETTE.text.muted,
    lineHeight: 15,
  },
  articleIcon: {
    marginBottom: -2,
  },
  actionSection: {
    marginTop: 24,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.default,
    paddingTop: 18,
  },
  registerButton: {
    backgroundColor: PALETTE.primary,
    paddingVertical: 15,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  consentNotice: {
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 17,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
