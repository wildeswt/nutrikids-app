import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountCard } from '../../components/AccountCard.js';
import { ChildBanner } from '../../components/ChildBanner.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatChildAge } from '../../lib/children-api.js';

export default function MyDataScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const { user } = useAuth();
  const { status, children, error, load } = useChildren();

  const caregiverName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  // The tabs keep their screens mounted, so the children are read again each time this one is shown.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.PROFILE);
    }
  };

  const renderChildren = () => {
    if (status === 'idle' || (status === 'loading' && children.length === 0)) {
      return (
        <View style={styles.stateBox} testID="my-data-loading">
          <ActivityIndicator color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('myData.loading')}</Text>
        </View>
      );
    }

    if (status === 'error' && children.length === 0) {
      return (
        <View style={styles.stateBox} testID="my-data-error">
          <Text style={styles.stateText}>{error ?? t('myData.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel={t('myData.retry')}
            testID="my-data-retry"
          >
            <Text style={styles.stateButtonText}>{t('myData.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (children.length === 0) {
      return (
        <View style={styles.stateBox} testID="my-data-empty">
          <Text style={styles.stateTitle}>{t('myData.emptyTitle')}</Text>
          <Text style={styles.stateText}>{t('myData.emptySubtitle')}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() =>
              router.push({
                pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
                params: { mode: 'register' },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('myData.addChild')}
            testID="my-data-add-child"
          >
            <Text style={styles.stateButtonText}>{t('myData.addChild')}</Text>
          </Pressable>
        </View>
      );
    }

    return children.map((child, index) => {
      const name = `${child.firstName} ${child.lastName}`;
      return (
        <View
          key={child.id}
          style={[styles.childRow, index > 0 && styles.childRowBorder]}
          testID={`my-data-child-${child.id}`}
        >
          <Pressable
            style={({ pressed }) => [styles.childMainLink, pressed && styles.pressed]}
            onPress={() =>
              router.push({
                pathname: APP_ROUTES.CAREGIVER.EDIT_CHILD as never,
                params: { childId: child.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('myData.fixDataA11y', { name })}
            testID={`my-data-fix-${child.id}`}
          >
            <View style={styles.childHeader}>
              <Text style={styles.childName}>{name}</Text>
              <Text style={styles.childSummary}>
                {t('myData.childSummary', {
                  age: formatChildAge(child.birthDate),
                  birthDate: formatLongDate(child.birthDate),
                })}
              </Text>
            </View>
            <View style={styles.childActionHint}>
              <Text style={styles.childActionText}>{t('myData.fixData')}</Text>
              <Ionicons name="chevron-forward" size={16} color={PALETTE.primary} />
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.childPrivacyLink, pressed && styles.pressed]}
            onPress={() =>
              router.push({
                pathname: APP_ROUTES.CAREGIVER.PRIVACY as never,
                params: { childId: child.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('myData.privacyLink')}
            testID={`my-data-privacy-${child.id}`}
          >
            <Text style={styles.childPrivacyText}>{t('myData.privacyLink')}</Text>
          </Pressable>
        </View>
      );
    });
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

        <Text style={styles.sectionTitle}>{t('myData.childrenTitle')}</Text>
        <Text style={styles.sectionDescription}>{t('myData.childrenDescription')}</Text>
        {renderChildren()}

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
  sectionDescription: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    marginBottom: 12,
  },
  childRow: {
    paddingVertical: 12,
    gap: 6,
  },
  childRowBorder: {
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.subtle,
  },
  childMainLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  childHeader: {
    flex: 1,
    gap: 2,
  },
  childName: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  childSummary: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  childActionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  childActionText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.primary,
  },
  childPrivacyLink: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  childPrivacyText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.text.muted,
    textDecorationLine: 'underline',
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
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
  },
  stateTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 18,
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  stateButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
