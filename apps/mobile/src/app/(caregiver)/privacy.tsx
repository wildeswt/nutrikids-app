import { Ionicons } from '@expo/vector-icons';
import { ERASURE_LEGAL_DEADLINE_DAYS, type ChildResponse } from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { ConsentChildItem } from '../../components/ConsentChildItem.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useDataRights } from '../../hooks/useDataRights.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatChildAge } from '../../lib/children-api.js';
import { isNotLegalRepresentativeError } from '../../lib/data-rights-api.js';

/** Rights of the legal representative over one child (export, deletion) and its consent. */
export function ChildPrivacyPanel({ child }: { child: ChildResponse }) {
  const { t } = useTranslation(['caregiver', 'common']);
  const {
    status,
    error,
    busy,
    pendingRequest,
    load,
    requestDeletion,
    cancelDeletion,
    exportHistory,
  } = useDataRights(child.id);
  const name = `${child.firstName} ${child.lastName}`;

  // The tabs keep their screens mounted, so the requests are read again each time this one is shown.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const showError = (title: string, err: unknown, fallback: string) =>
    Alert.alert(
      title,
      isNotLegalRepresentativeError(err)
        ? t('privacy.forbidden', { name: child.firstName })
        : err instanceof Error
          ? err.message
          : fallback,
    );

  const handleExport = async () => {
    try {
      await exportHistory();
    } catch (err) {
      showError(t('privacy.exportErrorTitle'), err, t('privacy.exportErrorTitle'));
    }
  };

  const handleRequestDeletion = () => {
    Alert.alert(
      t('privacy.deleteConfirmTitle', { name: child.firstName }),
      t('privacy.deleteConfirmMessage', { days: ERASURE_LEGAL_DEADLINE_DAYS }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('privacy.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await requestDeletion();
              Alert.alert(
                t('privacy.requestedTitle'),
                t('privacy.requestedMessage', { name: child.firstName }),
              );
            } catch (err) {
              showError(t('privacy.deleteErrorTitle'), err, t('privacy.deleteErrorTitle'));
            }
          },
        },
      ],
    );
  };

  const handleCancelDeletion = () => {
    if (!pendingRequest) return;
    Alert.alert(
      t('privacy.cancelConfirmTitle'),
      t('privacy.cancelConfirmMessage', { name: child.firstName }),
      [
        { text: t('privacy.keepRequest'), style: 'cancel' },
        {
          text: t('privacy.cancelConfirm'),
          onPress: async () => {
            try {
              await cancelDeletion(pendingRequest.id);
              Alert.alert(
                t('privacy.cancelledTitle'),
                t('privacy.cancelledMessage', { name: child.firstName }),
              );
            } catch (err) {
              showError(t('privacy.cancelErrorTitle'), err, t('privacy.cancelErrorTitle'));
            }
          },
        },
      ],
    );
  };

  const renderRights = () => {
    if (status === 'idle' || status === 'loading') {
      return (
        <View style={styles.stateBox} testID="privacy-loading">
          <ActivityIndicator color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('privacy.loading')}</Text>
        </View>
      );
    }

    if (status === 'forbidden') {
      return (
        <View style={styles.notice} accessibilityRole="alert" testID="privacy-forbidden">
          <Ionicons name="lock-closed-outline" size={20} color={PALETTE.feedback.warning} />
          <Text style={styles.noticeText}>{t('privacy.forbidden', { name: child.firstName })}</Text>
        </View>
      );
    }

    if (status === 'error') {
      return (
        <View style={styles.stateBox} testID="privacy-error">
          <Text style={styles.stateText}>{error ?? t('privacy.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel={t('privacy.retry')}
            testID="privacy-retry"
          >
            <Text style={styles.stateButtonText}>{t('privacy.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <>
        {/* Exportar el historial */}
        <View style={styles.card} testID="privacy-export">
          <Text style={styles.cardTitle}>{t('privacy.exportTitle')}</Text>
          <Text style={styles.cardText}>
            {t('privacy.exportDescription', { name: child.firstName })}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              busy === 'export' && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
            onPress={() => void handleExport()}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={t('privacy.exportButton')}
            accessibilityState={{ busy: busy === 'export', disabled: busy !== null }}
            testID="privacy-export-button"
          >
            <Ionicons name="download-outline" size={20} color={PALETTE.text.light} />
            <Text style={styles.primaryButtonText}>
              {busy === 'export' ? t('privacy.exporting') : t('privacy.exportButton')}
            </Text>
          </Pressable>
        </View>

        {/* Solicitar la eliminación (con confirmación previa) */}
        {pendingRequest ? (
          <View style={[styles.card, styles.cardPending]} testID="privacy-pending">
            <Text style={styles.cardTitle}>{t('privacy.pendingTitle')}</Text>
            <Text style={styles.cardText}>
              {t('privacy.pendingMessage', {
                name: child.firstName,
                requestedAt: formatLongDate(new Date(pendingRequest.requestedAt)),
                dueAt: formatLongDate(new Date(pendingRequest.dueAt)),
              })}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.outlineButton,
                busy === 'cancel' && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
              onPress={handleCancelDeletion}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={t('privacy.cancelButton')}
              testID="privacy-cancel-button"
            >
              <Text style={styles.outlineButtonText}>{t('privacy.cancelButton')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card} testID="privacy-delete">
            <Text style={styles.cardTitle}>{t('privacy.deleteTitle')}</Text>
            <Text style={styles.cardText}>
              {t('privacy.deleteDescription', { name: child.firstName })}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.dangerButton,
                busy === 'erasure' && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
              onPress={handleRequestDeletion}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={t('privacy.deleteButton')}
              testID="privacy-delete-button"
            >
              <Text style={styles.dangerButtonText}>{t('privacy.deleteButton')}</Text>
            </Pressable>
          </View>
        )}
      </>
    );
  };

  return (
    <View testID={`privacy-panel-${child.id}`}>
      <ChildBanner
        style={styles.banner}
        name={name}
        subtitle={t('privacy.childSubtitle', {
          age: formatChildAge(child.birthDate),
          birthDate: formatLongDate(child.birthDate),
        })}
      />

      <Text style={styles.sectionTitle}>{t('privacy.consentTitle')}</Text>
      <ConsentChildItem child={child} />

      {renderRights()}
    </View>
  );
}

export default function PrivacyScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { status, children, error, load } = useChildren();
  const [selectedId, setSelectedId] = useState<string | null>(params.childId ?? null);
  const child = children.find((item) => item.id === selectedId) ?? children[0] ?? null;

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

  const renderBody = () => {
    if (status === 'idle' || (status === 'loading' && children.length === 0)) {
      return (
        <View style={styles.stateBox} testID="privacy-children-loading">
          <ActivityIndicator color={PALETTE.primary} />
          <Text style={styles.stateText}>{t('privacy.loading')}</Text>
        </View>
      );
    }

    if (status === 'error' && children.length === 0) {
      return (
        <View style={styles.stateBox} testID="privacy-children-error">
          <Text style={styles.stateText}>{error ?? t('privacy.loadError')}</Text>
          <Pressable
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel={t('privacy.retry')}
            testID="privacy-children-retry"
          >
            <Text style={styles.stateButtonText}>{t('privacy.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (!child) {
      return (
        <View style={styles.stateBox} testID="privacy-children-empty">
          <Text style={styles.stateTitle}>{t('privacy.noChildrenTitle')}</Text>
          <Text style={styles.stateText}>{t('privacy.noChildrenSubtitle')}</Text>
        </View>
      );
    }

    return (
      <>
        {children.length > 1 ? (
          <View style={styles.chipRow}>
            {children.map((item) => {
              const selected = item.id === child.id;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSelectedId(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`privacy-child-${item.id}`}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {item.firstName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {/* One panel per child: switching child starts its own requests and consent. */}
        <ChildPrivacyPanel key={child.id} child={child} />
      </>
    );
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-privacy-screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('privacy.back')}
          testID="privacy-back"
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('privacy.back')}</Text>
        </Pressable>
        <Text style={styles.screenTitle}>{t('privacy.title')}</Text>
        <Text style={styles.intro}>{t('privacy.intro')}</Text>
        {renderBody()}
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
    paddingBottom: 36,
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
    marginBottom: 8,
  },
  intro: {
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
    marginBottom: 16,
  },
  banner: {
    marginBottom: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: PALETTE.input.background,
    borderWidth: 1.5,
    borderColor: PALETTE.border.checkbox,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  chipSelected: {
    backgroundColor: PALETTE.secondary,
    borderColor: PALETTE.secondary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  chipTextSelected: {
    color: PALETTE.text.light,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 10,
  },
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    padding: 16,
    marginTop: 18,
    gap: 10,
  },
  cardPending: {
    backgroundColor: PALETTE.feedback.warningBg,
    borderColor: PALETTE.feedback.warning,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: PALETTE.text.title,
  },
  cardText: {
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    height: 50,
  },
  primaryButtonText: {
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '700',
  },
  outlineButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
    backgroundColor: PALETTE.surface,
    height: 48,
  },
  outlineButtonText: {
    color: PALETTE.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  dangerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: PALETTE.feedback.errorBorder,
    backgroundColor: PALETTE.feedback.errorBg,
    height: 48,
  },
  dangerButtonText: {
    color: PALETTE.feedback.error,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: PALETTE.feedback.warningBg,
    borderRadius: 16,
    padding: 12,
    marginTop: 18,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
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
