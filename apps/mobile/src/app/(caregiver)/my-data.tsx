import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountCard } from '../../components/AccountCard.js';
import { ChildBanner } from '../../components/ChildBanner.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';

export default function MyDataScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const { user } = useAuth();

  const caregiverName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.PROFILE);
    }
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-my-data-screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={t('myData.title')}
          backLabel={t('myData.back')}
          onBack={handleBack}
          style={styles.header}
          testID="my-data-header"
        />

        <ChildBanner
          name={
            caregiverName
              ? t('myData.bannerTitle', { name: caregiverName, role: t('common:roles.CAREGIVER') })
              : t('common:roles.CAREGIVER')
          }
          subtitle={t('myData.bannerSubtitle')}
          style={styles.banner}
          testID="my-data-banner"
        />

        <Text style={styles.sectionTitle}>{t('myData.accountTitle')}</Text>
        <AccountCard />

        <View style={styles.sectionDivider} />

        <Pressable
          style={({ pressed }) => [styles.bottomPrivacyRow, pressed && styles.pressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.PRIVACY as never)}
          accessibilityRole="button"
          accessibilityLabel={t('myData.privacyLink')}
          testID="my-data-privacy-bottom"
        >
          <View style={styles.bottomPrivacyContent}>
            <Text style={styles.bottomPrivacyTitle}>{t('myData.privacyLink')}</Text>
            <Text style={styles.bottomPrivacySubtitle}>{t('myData.privacySubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={PALETTE.primary} />
        </Pressable>
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
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 0,
    paddingTop: 0,
    marginBottom: 16,
  },
  banner: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
    marginBottom: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: PALETTE.border.subtle,
    marginVertical: 20,
  },
  bottomPrivacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  bottomPrivacyContent: {
    flex: 1,
    gap: 2,
  },
  bottomPrivacyTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  bottomPrivacySubtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  pressed: {
    opacity: 0.85,
  },
});
