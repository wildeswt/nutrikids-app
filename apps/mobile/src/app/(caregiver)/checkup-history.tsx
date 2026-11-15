import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckupMenuButton } from '../../components/CheckupMenuButton.js';
import { ChildBanner } from '../../components/ChildBanner.js';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_HEIGHT, BUTTON_WIDTH, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useOptionalAuth } from '../../context/auth-context.js';
import { useCheckups } from '../../hooks/useCheckups.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatDecimal, formatLongDate } from '../../i18n/format.js';
import { formatCheckupRecorder } from '../../lib/checkup-recorder.js';

/** Historial de controles de un niño (cuidador): una tarjeta por control con su menú ⋮. */
export default function CheckupHistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const auth = useOptionalAuth();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { status: childrenStatus, children, load: loadChildren } = useChildren();
  const child = children.find((c) => c.id === params.childId) ?? children[0] ?? null;
  const { status, checkups, load } = useCheckups(child?.id ?? null, { autoLoad: false });

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // Reloads every time the screen is shown (also when coming back from correcting a checkup).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Opened from «Anotar un control», which is the previous screen in the tabs' history (also after
  // correcting a checkup, which returns here with `navigate`).
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.ADD_CHECKUP as never);
    }
  };

  const renderBody = () => {
    if (!child || childrenStatus === 'idle' || status === 'idle' || status === 'loading') {
      return (
        <View style={styles.stateBox} testID="checkup-history-loading">
          <ActivityIndicator color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('checkupHistory.loading')}</Text>
        </View>
      );
    }
    if (status === 'error') {
      return (
        <View style={styles.stateBox} testID="checkup-history-error">
          <Text style={styles.stateText}>{t('checkupHistory.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel={t('checkupHistory.retry')}
            testID="checkup-history-retry"
          >
            <Text style={styles.stateButtonText}>{t('checkupHistory.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    if (checkups.length === 0) {
      return (
        <View style={styles.stateBox} testID="checkup-history-empty">
          <Text style={styles.stateTitle}>{t('checkupHistory.emptyTitle')}</Text>
          <Text style={styles.stateText}>{t('checkupHistory.emptySubtitle')}</Text>
        </View>
      );
    }
    return checkups.map((checkup) => (
      <View key={checkup.id} style={styles.card} testID={`checkup-history-item-${checkup.id}`}>
        <View style={styles.cardTop}>
          <Text style={styles.cardDate}>{formatLongDate(checkup.measuredAt)}</Text>
          <CheckupMenuButton
            checkup={checkup}
            roleMode="CAREGIVER"
            returnTo="checkup-history"
            onDeleted={() => void load()}
            testID={`checkup-history-menu-${checkup.id}`}
          />
        </View>
        <Text style={styles.cardValues}>
          {`${t('common:units.weightValue', { value: formatDecimal(checkup.weightKg) })} · ${t(
            'common:units.heightValue',
            { value: formatDecimal(checkup.lengthHeightCm) },
          )}`}
        </Text>
        <Text style={styles.cardMeta}>{t(`addCheckup.positions.${checkup.position}`)}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {`${t('evolution.recordedBy')} ${formatCheckupRecorder({
            recorder: checkup.recordedBy,
            origin: checkup.origin,
            currentUserId: auth?.user?.id,
            t,
          })}`}
        </Text>
        {checkup.notes ? <Text style={styles.cardText}>{checkup.notes}</Text> : null}
      </View>
    ));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="caregiver-checkup-history-screen"
      >
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('feeding.back')}
          testID="checkup-history-back"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('feeding.back')}</Text>
        </Pressable>

        <Text style={styles.screenTitle} accessibilityRole="header">
          {t('checkupHistory.title')}
        </Text>

        {child ? (
          <ChildBanner
            name={`${child.firstName} ${child.lastName}`}
            subtitle={t('checkupHistory.subtitle', { count: checkups.length })}
            style={styles.banner}
            testID="checkup-history-banner"
          />
        ) : null}

        <View style={styles.list}>{renderBody()}</View>

        <Pressable
          style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
          onPress={() =>
            router.push({
              pathname: APP_ROUTES.CAREGIVER.ADD_CHECKUP as never,
              params: child ? { childId: child.id } : {},
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('checkupHistory.register')}
          testID="checkup-history-register"
        >
          <Text style={styles.submitButtonText}>{t('checkupHistory.register')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  scrollContent: { paddingHorizontal: SCREEN_MARGIN, paddingTop: 12, paddingBottom: 36 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backText: {
    fontFamily: font('medium'),
    fontSize: 20,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  screenTitle: {
    fontFamily: font('semibold'),
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 18,
  },
  banner: { marginBottom: 24 },
  list: { gap: 12 },
  card: {
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 2,
    borderColor: PALETTE.border.input,
    paddingLeft: 22,
    paddingRight: 14,
    paddingVertical: 14,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate: {
    flex: 1,
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.primary,
  },
  cardValues: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    color: PALETTE.text.title,
  },
  cardMeta: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  cardText: { fontFamily: font('regular'), fontSize: 14, color: PALETTE.text.body, marginTop: 2 },
  stateBox: { alignItems: 'center', gap: 12, paddingVertical: 28 },
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
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: { color: PALETTE.text.light, fontSize: 15, fontWeight: '700' },
  submitButton: {
    marginTop: 28,
    width: '100%',
    maxWidth: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    alignSelf: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonPressed: { backgroundColor: PALETTE.primaryPressed },
  submitButtonText: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: { opacity: 0.8 },
});
