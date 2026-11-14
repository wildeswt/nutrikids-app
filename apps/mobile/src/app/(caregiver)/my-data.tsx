import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatChildAge } from '../../lib/children-api.js';

export default function MyDataScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const { user } = useAuth();
  const { status, children, error, load } = useChildren();

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

    return children.map((child) => {
      const name = `${child.firstName} ${child.lastName}`;
      return (
        <View key={child.id} style={styles.childCard} testID={`my-data-child-${child.id}`}>
          <View style={styles.childHeader}>
            <Text style={styles.childName}>{name}</Text>
            <Text style={styles.childSummary}>
              {t('myData.childSummary', {
                age: formatChildAge(child.birthDate),
                birthDate: formatLongDate(child.birthDate),
              })}
            </Text>
          </View>
          <View style={styles.childActions}>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
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
              <Text style={styles.outlineButtonText}>{t('myData.fixData')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
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
              <Text style={styles.outlineButtonText}>{t('myData.privacyLink')}</Text>
            </Pressable>
          </View>
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
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('myData.back')}
          testID="my-data-back"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('myData.back')}</Text>
        </Pressable>
        <Text style={styles.screenTitle}>{t('myData.title')}</Text>

        {/* Mi cuenta: solo lectura, la API aún no permite cambiarla */}
        <Text style={styles.sectionTitle}>{t('myData.accountTitle')}</Text>
        <View style={styles.card} testID="my-data-account">
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('myData.name')}</Text>
            <Text style={styles.rowValue}>{user ? `${user.firstName} ${user.lastName}` : '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('myData.email')}</Text>
            <Text style={styles.rowValue}>{user?.email ?? '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('myData.phone')}</Text>
            <Text style={[styles.rowValue, styles.rowValueMuted]}>
              {t('myData.phoneUnavailable')}
            </Text>
          </View>

          <View style={styles.notice} testID="my-data-account-locked">
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={PALETTE.feedback.warning}
            />
            <Text style={styles.noticeText}>{t('myData.accountLocked')}</Text>
          </View>
          <Pressable
            style={[styles.primaryButton, styles.primaryButtonDisabled]}
            disabled
            accessibilityRole="button"
            accessibilityLabel={t('myData.editAccount')}
            accessibilityState={{ disabled: true }}
            testID="my-data-edit-account"
          >
            <Text style={styles.primaryButtonText}>{t('myData.editAccount')}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>{t('myData.childrenTitle')}</Text>
        <Text style={styles.sectionDescription}>{t('myData.childrenDescription')}</Text>
        {renderChildren()}
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
    paddingBottom: 32,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: PALETTE.text.muted,
    marginBottom: 12,
  },
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  row: {
    gap: 2,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.muted,
  },
  rowValue: {
    fontSize: 16,
    color: PALETTE.text.body,
  },
  rowValueMuted: {
    color: PALETTE.text.muted,
    fontStyle: 'italic',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: PALETTE.feedback.warningBg,
    borderRadius: 16,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '700',
  },
  childCard: {
    backgroundColor: PALETTE.secondaryLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.secondary,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  childHeader: {
    gap: 2,
  },
  childName: {
    fontSize: 17,
    fontWeight: '800',
    color: PALETTE.text.title,
  },
  childSummary: {
    fontSize: 13,
    color: PALETTE.text.body,
  },
  childActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  outlineButton: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  outlineButtonText: {
    color: PALETTE.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  stateButtonText: {
    color: PALETTE.text.light,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
