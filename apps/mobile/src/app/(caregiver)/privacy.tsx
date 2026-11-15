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
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useConsent } from '../../hooks/useConsent.js';
import { useDataRights } from '../../hooks/useDataRights.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatChildAge } from '../../lib/children-api.js';
import { isNotLegalRepresentativeError } from '../../lib/data-rights-api.js';

/** Rights of the legal representative over one child (export, deletion) and its consent. */
export function ChildPrivacyPanel({
  child,
  hideBanner = false,
}: {
  child: ChildResponse;
  hideBanner?: boolean;
}) {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
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
  const {
    status: consentStatus,
    consent,
    load: loadConsent,
    revoke: revokeConsent,
  } = useConsent(child.id);
  const [revokingConsent, setRevokingConsent] = useState(false);
  const name = `${child.firstName} ${child.lastName}`;

  // The tabs keep their screens mounted, so the requests are read again each time this one is shown.
  useFocusEffect(
    useCallback(() => {
      void load();
      void loadConsent();
    }, [load, loadConsent]),
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

  const openConsent = () => {
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { childId: child.id, childName: child.firstName, mode: 'view' },
    });
  };

  const handleRevokeConsent = () => {
    Alert.alert(
      t('consentItem.revokeTitle'),
      t('consentItem.revokeMessage', { name: child.firstName }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('consentItem.revokeConfirm'),
          style: 'destructive',
          onPress: async () => {
            setRevokingConsent(true);
            try {
              await revokeConsent();
              Alert.alert(
                t('consentItem.revokeSuccessTitle'),
                t('consentItem.revokeSuccessMessage'),
              );
            } catch {
              Alert.alert(t('consentItem.revokeErrorTitle'), t('consentItem.revokeErrorMessage'));
            } finally {
              setRevokingConsent(false);
            }
          },
        },
      ],
    );
  };

  const renderConsentSection = () => {
    const active = Boolean(consent && !consent.revokedAt);
    const revoked = Boolean(consent?.revokedAt);
    const statusText = active
      ? t('privacy.consentStatusActive')
      : revoked
        ? t('privacy.consentStatusRevoked')
        : t('privacy.consentStatusNone');
    const statusDateText =
      active && consent
        ? t('privacy.consentAcceptedOn', { date: formatLongDate(new Date(consent.grantedAt)) })
        : revoked && consent?.revokedAt
          ? t('privacy.consentRevokedOn', { date: formatLongDate(new Date(consent.revokedAt)) })
          : null;

    return (
      <View style={styles.section} testID="privacy-consent-section">
        <Text style={styles.sectionTitle}>{t('privacy.consentTitle')}</Text>
        {consentStatus === 'loading' && !consent ? (
          <ActivityIndicator size="small" color={PALETTE.primary} />
        ) : (
          <>
            <View style={styles.consentStatusBlock}>
              <View style={styles.consentStatusRow}>
                <Ionicons
                  name={active ? 'checkmark-circle' : 'alert-circle-outline'}
                  size={18}
                  color={active ? PALETTE.primary : PALETTE.feedback.error}
                />
                <Text style={[styles.consentStatusText, !active && styles.consentStatusMuted]}>
                  {statusText}
                </Text>
              </View>
              {statusDateText ? <Text style={styles.consentDateText}>{statusDateText}</Text> : null}
            </View>

            {active ? (
              <Text style={styles.sectionText}>
                {t('privacy.consentActiveHint', { name: child.firstName })}
              </Text>
            ) : revoked ? (
              <Text style={styles.sectionText}>
                {t('privacy.consentRevokedHint', { name: child.firstName })}
              </Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}
              onPress={openConsent}
              accessibilityRole="button"
              testID="privacy-read-consent"
            >
              <Text style={styles.inlineLinkText}>
                {consent ? t('privacy.readConsent') : t('privacy.grantConsent')}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={PALETTE.primary} />
            </Pressable>

            {active ? (
              <View style={styles.sectionActionCenter}>
                <SecondaryButton
                  label={t('privacy.revokeConsent')}
                  onPress={handleRevokeConsent}
                  loading={revokingConsent}
                  disabled={revokingConsent}
                  testID="privacy-revoke-consent"
                />
              </View>
            ) : null}
          </>
        )}
      </View>
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
        <View style={styles.divider} />

        {/* Exportar el historial */}
        <View style={styles.section} testID="privacy-export">
          <Text style={styles.sectionTitle}>{t('privacy.exportTitle')}</Text>
          <Text style={styles.sectionText}>
            {t('privacy.exportDescription', { name: child.firstName })}
          </Text>
          {/* NOTE: lib/history-export.ts only supports CSV export; "Descargar PDF" is omitted until PDF generation is supported. */}
          <View style={styles.sectionActionCenter}>
            <SecondaryButton
              label={busy === 'export' ? t('privacy.exporting') : t('privacy.exportButton')}
              onPress={() => void handleExport()}
              disabled={busy !== null}
              accessibilityLabel={t('privacy.exportButton')}
              testID="privacy-export-button"
            />
          </View>
        </View>

        <View style={styles.divider} />

        {/* Solicitar la eliminación (con confirmación previa) */}
        {pendingRequest ? (
          <View style={[styles.section, styles.pendingSection]} testID="privacy-pending">
            <Text style={styles.sectionTitle}>{t('privacy.pendingTitle')}</Text>
            <Text style={styles.sectionText}>
              {t('privacy.pendingMessage', {
                name: child.firstName,
                requestedAt: formatLongDate(new Date(pendingRequest.requestedAt)),
                dueAt: formatLongDate(new Date(pendingRequest.dueAt)),
              })}
            </Text>
            <View style={styles.sectionActionCenter}>
              <SecondaryButton
                label={t('privacy.cancelButton')}
                onPress={handleCancelDeletion}
                disabled={busy !== null}
                accessibilityLabel={t('privacy.cancelButton')}
                testID="privacy-cancel-button"
              />
            </View>
          </View>
        ) : (
          <View style={styles.section} testID="privacy-delete">
            <Text style={[styles.sectionTitle, styles.dangerSectionTitle]}>
              {t('privacy.deleteTitle')}
            </Text>
            <Text style={styles.sectionText}>
              {t('privacy.deleteDescription', { name: child.firstName })}
            </Text>
            <View style={styles.sectionActionCenter}>
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
          </View>
        )}
      </>
    );
  };

  return (
    <View testID={`privacy-panel-${child.id}`}>
      {!hideBanner ? (
        <ChildBanner
          style={styles.banner}
          name={name}
          subtitle={t('privacy.childSubtitle', {
            age: formatChildAge(child.birthDate),
            birthDate: formatLongDate(child.birthDate),
          })}
        />
      ) : null}

      {renderConsentSection()}

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
  const [selectorOpen, setSelectorOpen] = useState(false);
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

  const renderBannerSelector = (activeChild: ChildResponse) => {
    const fullName = `${activeChild.firstName} ${activeChild.lastName}`;
    const subtitle = t('privacy.childSubtitle', {
      age: formatChildAge(activeChild.birthDate),
      birthDate: formatLongDate(activeChild.birthDate),
    });

    if (children.length <= 1) {
      return <ChildBanner style={styles.banner} name={fullName} subtitle={subtitle} />;
    }

    return (
      <View style={styles.bannerWrapper}>
        <Pressable
          onPress={() => setSelectorOpen((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={t('privacy.selectChildA11y')}
          accessibilityState={{ expanded: selectorOpen }}
          testID="privacy-child-selector"
        >
          <ChildBanner name={fullName} subtitle={subtitle} style={styles.bannerInner} />
          <View style={styles.bannerChevron} pointerEvents="none">
            <Ionicons
              name={selectorOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={PALETTE.text.light}
            />
          </View>
        </Pressable>

        {selectorOpen ? (
          <View style={styles.selectorList} testID="privacy-child-options">
            {children.map((item) => {
              const selected = item.id === activeChild.id;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.selectorOption, selected && styles.selectorOptionSelected]}
                  onPress={() => {
                    setSelectedId(item.id);
                    setSelectorOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`privacy-child-${item.id}`}
                >
                  <Text
                    style={[
                      styles.selectorOptionText,
                      selected && styles.selectorOptionTextSelected,
                    ]}
                  >
                    {`${item.firstName} ${item.lastName}`}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={16} color={PALETTE.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    );
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
        {renderBannerSelector(child)}
        {/* One panel per child: switching child starts its own requests and consent. */}
        <ChildPrivacyPanel key={child.id} child={child} hideBanner />
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
        <ScreenHeader
          title={t('privacy.title')}
          backLabel={t('privacy.back')}
          onBack={handleBack}
          style={styles.header}
          testID="privacy-header"
        />
        <Text style={styles.intro}>{t('privacy.intro')}</Text>
        {renderBody()}

        <Pressable
          style={({ pressed }) => [styles.bottomBackLink, pressed && styles.pressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.MY_DATA as never)}
          accessibilityRole="button"
          testID="privacy-back-to-my-data"
        >
          <Text style={styles.bottomBackLinkText}>{t('privacy.backToMyData')}</Text>
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
    paddingBottom: 36,
  },
  header: {
    paddingHorizontal: 0,
    paddingTop: 0,
    marginBottom: 8,
  },
  intro: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    lineHeight: 20,
    marginBottom: 18,
  },
  banner: {
    marginBottom: 20,
  },
  bannerWrapper: {
    marginBottom: 20,
  },
  bannerInner: {
    paddingRight: 44,
  },
  bannerChevron: {
    position: 'absolute',
    right: 18,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  selectorList: {
    marginTop: 8,
    backgroundColor: PALETTE.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.border.subtle,
    padding: 6,
    gap: 4,
  },
  selectorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  selectorOptionSelected: {
    backgroundColor: PALETTE.primaryLight,
  },
  selectorOptionText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.text.body,
  },
  selectorOptionTextSelected: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
  },
  section: {
    paddingVertical: 6,
    gap: 10,
  },
  pendingSection: {
    backgroundColor: PALETTE.feedback.warningBg,
    borderRadius: 18,
    padding: 16,
  },
  sectionTitle: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
  },
  dangerSectionTitle: {
    color: PALETTE.feedback.error,
  },
  sectionText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 20,
  },
  consentStatusBlock: {
    gap: 2,
  },
  consentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consentStatusText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.primary,
  },
  consentStatusMuted: {
    color: PALETTE.feedback.error,
  },
  consentDateText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    marginLeft: 24,
  },
  inlineLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 2,
  },
  inlineLinkText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.primary,
  },
  sectionActionCenter: {
    alignItems: 'center',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border.subtle,
    marginVertical: 18,
  },
  dangerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS_PILL,
    borderWidth: 1.5,
    borderColor: PALETTE.feedback.errorBorder,
    backgroundColor: PALETTE.surface,
    width: 318,
    maxWidth: '100%',
    height: 50,
  },
  dangerButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.feedback.error,
    fontSize: 15,
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
    fontFamily: font('regular'),
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
  bottomBackLink: {
    alignSelf: 'center',
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bottomBackLinkText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    color: PALETTE.primary,
  },
  pressed: {
    opacity: 0.85,
  },
});
