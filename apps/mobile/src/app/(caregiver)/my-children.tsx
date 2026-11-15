import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaregiverChildCard } from '../../components/CaregiverChildCard.js';
import { OfflineDataNotice } from '../../components/OfflineDataNotice.js';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { setActiveChildId } from '../../hooks/useActiveChild.js';
import { useChildren } from '../../hooks/useChildren.js';

/**
 * Pantalla «Mis niños» (oculta de la barra inferior): lista todos los niños vinculados
 * para elegir el niño activo del Inicio o agregar uno nuevo.
 */
export default function MyChildrenScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const { status, children, error, fromCache, stale, lastSyncedAt, loadError, load } =
    useChildren();

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
    }
  };

  const handleSelectChild = (childId: string) => {
    setActiveChildId(childId);
    handleBack();
  };

  const handleAddChild = () => {
    router.push(APP_ROUTES.CAREGIVER.ADD_CHILD);
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-my-children-screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={t('myChildren.title')}
          onBack={handleBack}
          backLabel={t('common:actions.back')}
          testID="my-children-header"
          style={styles.header}
        />

        <OfflineDataNotice
          fromCache={fromCache}
          stale={stale}
          lastSyncedAt={lastSyncedAt}
          testID="my-children-offline-notice"
          style={styles.offlineNotice}
        />

        {status === 'loading' && children.length === 0 ? (
          <Card style={styles.stateCard} testID="my-children-loading">
            <ActivityIndicator size="small" color={PALETTE.primary} />
            <Text style={styles.stateText}>{t('home.loading')}</Text>
          </Card>
        ) : null}

        {status === 'error' && children.length === 0 && loadError === 'needs-connection' ? (
          <Card style={styles.stateCard} testID="my-children-needs-connection">
            <Ionicons name="cloud-offline-outline" size={28} color={PALETTE.primary} />
            <Text style={styles.stateText}>{t('common:offline.noDataMessage')}</Text>
            <PrimaryButton
              label={t('home.retry')}
              onPress={() => void load()}
              accessibilityLabel={t('home.retryA11y')}
            />
          </Card>
        ) : null}

        {status === 'error' && children.length === 0 && loadError !== 'needs-connection' ? (
          <Card style={styles.errorCard} testID="my-children-error">
            <Ionicons name="alert-circle-outline" size={24} color={PALETTE.feedback.error} />
            <Text style={styles.errorText}>{error || t('home.loadError')}</Text>
            <PrimaryButton
              label={t('home.retry')}
              onPress={() => void load()}
              accessibilityLabel={t('home.retryA11y')}
            />
          </Card>
        ) : null}

        {children.length > 0 ? (
          <View style={styles.childrenList} testID="my-children-list">
            {children.map((child) => (
              <CaregiverChildCard
                key={child.id}
                child={child}
                onPress={() => handleSelectChild(child.id)}
                accessibilityLabel={t('myChildren.selectChildA11y', { name: child.firstName })}
                testID={`my-children-card-${child.id}`}
              />
            ))}
          </View>
        ) : null}

        {/* Tarjeta punteada para agregar un nuevo niño */}
        <Pressable
          style={({ pressed }) => [styles.dashedAddCard, pressed && styles.buttonPressed]}
          onPress={handleAddChild}
          testID="add-child-dashed-card"
          accessibilityRole="button"
          accessibilityLabel={t('home.addChild')}
        >
          <View style={styles.dashedAddIconCircle}>
            <Ionicons name="add" size={22} color={PALETTE.text.light} />
          </View>
          <Text style={styles.dashedAddText}>{t('home.addChild')}</Text>
        </Pressable>

        {/* Aviso de privacidad alineado a la izquierda */}
        <View style={styles.linkedNoticeRow} testID="my-children-linked-notice">
          <Ionicons name="lock-closed-outline" size={16} color={PALETTE.text.muted} />
          <Text style={styles.linkedNoticeText}>{t('home.linkedNotice')}</Text>
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
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 20,
  },
  offlineNotice: {
    marginBottom: 16,
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
    marginBottom: 18,
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: PALETTE.feedback.errorBg,
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  childrenList: {
    gap: 14,
    marginBottom: 16,
  },
  dashedAddCard: {
    backgroundColor: PALETTE.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
    borderStyle: 'dashed',
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
  },
  dashedAddIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedAddText: {
    fontFamily: font('semibold'),
    fontSize: 16,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  linkedNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkedNoticeText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
