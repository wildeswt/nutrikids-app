import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { Card } from '../../components/ui/Card.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { BUTTON_WIDTH, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useConsent } from '../../hooks/useConsent.js';
import { formatNumericDate, formatTime } from '../../i18n/format.js';
import { CURRENT_CONSENT_VERSION, getConsentText } from '../../lib/consent-api.js';

export default function ConsentScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation(['consent', 'common']);
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    childId?: string;
    childName?: string;
    mode?: 'register' | 'view';
  }>();

  const childId = params.childId ?? null;
  const childName = params.childName ?? t('screen.childFallback');
  const mode = params.mode ?? (childId ? 'view' : 'register');

  const { status, consent, error, load, grant, revoke } = useConsent(childId);

  const [isLegalRepresentative, setIsLegalRepresentative] = useState(false);
  const [understandsRevocation, setUnderstandsRevocation] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    error?: boolean;
    confirmLabel?: string;
    onClose?: () => void;
  } | null>(null);

  useEffect(() => {
    if (childId && mode === 'view') {
      void load();
    }
  }, [childId, mode, load]);

  const closeNotice = () => {
    const onClose = notice?.onClose;
    setNotice(null);
    onClose?.();
  };

  const handleAcceptConsent = async () => {
    if (childId) {
      try {
        await grant(CURRENT_CONSENT_VERSION);
        setNotice({
          title: t('alerts.grantedTitle'),
          message: t('alerts.grantedMessage'),
          onClose: () => router.replace(APP_ROUTES.CAREGIVER.PROFILE),
        });
      } catch (err) {
        setNotice({
          title: t('alerts.errorTitle'),
          message: err instanceof Error ? err.message : t('alerts.grantError'),
          error: true,
        });
      }
    } else {
      // Pre-registration flow: go straight to the child registration screen
      router.replace(APP_ROUTES.CAREGIVER.ADD_CHILD as never);
    }
  };

  const handleRevokeConsent = () => {
    if (!childId) return;
    setConfirmRevoke(true);
  };

  const performRevoke = async () => {
    setConfirmRevoke(false);
    try {
      await revoke();
      setNotice({
        title: t('alerts.revokedTitle'),
        message: t('alerts.revokedMessage'),
        confirmLabel: t('common:actions.understood'),
        onClose: () => router.replace(APP_ROUTES.CAREGIVER.PROFILE),
      });
    } catch (err) {
      setNotice({
        title: t('alerts.revokeErrorTitle'),
        message: err instanceof Error ? err.message : t('alerts.revokeError'),
        error: true,
      });
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME as never);
    }
  };

  const displayedVersion = consent?.textVersion ?? CURRENT_CONSENT_VERSION;
  const textBody = getConsentText(displayedVersion);
  // The legal text is only published in languages where it was reviewed; otherwise it is shown
  // in Spanish and the caregiver is told so.
  const isDocumentTranslated = Boolean(
    i18n.getResource(i18n.language, 'consent', `documents.${displayedVersion}`),
  );

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return t('common:time.dateAtTime', { date: formatNumericDate(d), time: formatTime(d) });
  };

  const isActionLoading = status === 'loading';
  const isGranting = mode === 'register' || (mode === 'view' && Boolean(consent?.revokedAt));
  const canGrant = isLegalRepresentative && understandsRevocation;
  const caregiverName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} testID="consent-screen">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          onPress={handleBack}
          hitSlop={8}
          testID="back-button"
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.goBack')}
        >
          <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
          <Text style={styles.backButtonText}>{t('screen.back')}</Text>
        </Pressable>

        <Text style={styles.screenTitle}>{t('screen.title')}</Text>

        {mode === 'register' ? (
          <Text style={styles.screenSubtitle}>{t('screen.registerSubtitle')}</Text>
        ) : (
          <ChildBanner
            name={childName}
            subtitle={
              caregiverName ? t('screen.representative', { name: caregiverName }) : undefined
            }
            style={styles.childBanner}
            testID="consent-child-banner"
          />
        )}

        {/* Metadata de fecha si ya existe consentimiento */}
        {consent && (
          <Card style={styles.metaCard} testID="consent-metadata">
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('screen.grantedAtLabel')}</Text>
              <Text style={styles.metaValue}>{formatDate(consent.grantedAt)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('screen.statusLabel')}</Text>
              <Text
                style={[
                  styles.statusBadge,
                  consent.revokedAt ? styles.statusRevoked : styles.statusActive,
                ]}
              >
                {consent.revokedAt ? t('screen.statusRevoked') : t('screen.statusActive')}
              </Text>
            </View>

            {consent.revokedAt && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('screen.revokedAtLabel')}</Text>
                <Text style={styles.metaValue}>{formatDate(consent.revokedAt)}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Notificación de error si ocurre */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={PALETTE.feedback.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ¿Qué autorizas? */}
        <View style={styles.authorizeHeader}>
          <View style={styles.shieldCircle}>
            <Ionicons name="shield-checkmark" size={22} color={PALETTE.secondary} />
          </View>
          <Text style={styles.sectionTitle}>{t('screen.authorizeTitle')}</Text>
        </View>

        <View style={styles.bulletList}>
          <View style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Ionicons name="checkmark" size={14} color={PALETTE.primary} />
            </View>
            <Text style={styles.bulletText}>{t('screen.points.store', { name: childName })}</Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Ionicons name="checkmark" size={14} color={PALETTE.primary} />
            </View>
            <Text style={styles.bulletText}>{t('screen.points.who')}</Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Ionicons name="checkmark" size={14} color={PALETTE.primary} />
            </View>
            <Text style={styles.bulletText}>{t('screen.points.share')}</Text>
          </View>
        </View>

        {/* Texto completo del consentimiento (desplegable) */}
        <Pressable
          style={({ pressed }) => [styles.readMoreRow, pressed && styles.buttonPressed]}
          onPress={() => setShowFullText((prev) => !prev)}
          testID="toggle-consent-text"
          accessibilityRole="button"
          accessibilityState={{ expanded: showFullText }}
          accessibilityLabel={t('screen.readFullA11y')}
        >
          <Text style={styles.readMoreText}>
            {showFullText ? t('screen.hideFull') : t('screen.readFull')}
          </Text>
          <Ionicons
            name={showFullText ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={PALETTE.primary}
          />
        </Pressable>

        {showFullText && (
          <Card style={styles.fullTextCard} testID="consent-full-text">
            {!isDocumentTranslated && (
              <Text style={styles.documentLanguageNotice}>{t('screen.documentInSpanish')}</Text>
            )}
            <Text style={styles.fullTextBody}>{textBody}</Text>
          </Card>
        )}

        <View style={styles.divider} />

        {/* Confirmaciones del representante legal */}
        {isGranting && (
          <View style={styles.checkboxGroup}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setIsLegalRepresentative((prev) => !prev)}
              testID="legal-representative-checkbox"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isLegalRepresentative }}
              accessibilityLabel={t('screen.checkLegalA11y')}
            >
              <View
                style={[styles.checkboxBox, isLegalRepresentative && styles.checkboxBoxChecked]}
              >
                {isLegalRepresentative && (
                  <Ionicons name="checkmark" size={16} color={PALETTE.text.light} />
                )}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('screen.checkLegal', { name: childName })}
              </Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setUnderstandsRevocation((prev) => !prev)}
              testID="understands-revocation-checkbox"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: understandsRevocation }}
              accessibilityLabel={t('screen.checkRevocationA11y')}
            >
              <View
                style={[styles.checkboxBox, understandsRevocation && styles.checkboxBoxChecked]}
              >
                {understandsRevocation && (
                  <Ionicons name="checkmark" size={16} color={PALETTE.text.light} />
                )}
              </View>
              <Text style={styles.checkboxLabel}>{t('screen.checkRevocation')}</Text>
            </Pressable>
          </View>
        )}

        {/* Acciones según el modo y estado */}
        <View style={styles.actionsContainer}>
          {mode === 'register' && (
            <PrimaryButton
              label={t('screen.accept')}
              onPress={() => void handleAcceptConsent()}
              loading={isActionLoading}
              disabled={isActionLoading || !canGrant}
              testID="accept-consent-button"
              accessibilityLabel={t('screen.accept')}
            />
          )}

          {mode === 'view' && consent && !consent.revokedAt && (
            <Pressable
              style={({ pressed }) => [
                styles.revokeButton,
                pressed && styles.buttonPressed,
                isActionLoading && styles.buttonDisabled,
              ]}
              onPress={handleRevokeConsent}
              disabled={isActionLoading}
              testID="revoke-consent-button"
              accessibilityRole="button"
              accessibilityLabel={t('screen.revoke')}
            >
              {isActionLoading ? (
                <ActivityIndicator color={PALETTE.feedback.error} />
              ) : (
                <Text style={styles.revokeButtonText}>{t('screen.revoke')}</Text>
              )}
            </Pressable>
          )}

          {mode === 'view' && consent?.revokedAt && (
            <PrimaryButton
              label={t('screen.renew')}
              onPress={() => void handleAcceptConsent()}
              loading={isActionLoading}
              disabled={isActionLoading || !canGrant}
              testID="renew-consent-button"
              accessibilityLabel={t('screen.renew')}
            />
          )}

          {isGranting && (
            <SecondaryButton
              label={t('screen.notNow')}
              onPress={handleBack}
              testID="decline-consent-button"
              accessibilityLabel={t('screen.notNow')}
            />
          )}
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={confirmRevoke}
        tone="danger"
        icon="shield-outline"
        title={t('alerts.revokeTitle')}
        message={t('alerts.revokeMessage', { name: childName })}
        confirmLabel={t('alerts.revokeConfirm')}
        cancelLabel={t('common:actions.cancel')}
        onConfirm={() => void performRevoke()}
        onCancel={() => setConfirmRevoke(false)}
        testID="consent-revoke-dialog"
      />
      <ConfirmDialog
        visible={notice !== null}
        tone={notice?.error ? 'danger' : 'primary'}
        icon={notice?.error ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        title={notice?.title ?? ''}
        message={notice?.message}
        confirmLabel={notice?.confirmLabel ?? t('common:actions.accept')}
        onConfirm={closeNotice}
        onCancel={closeNotice}
        testID="consent-notice-dialog"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 8,
  },
  backButtonText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 20,
    color: PALETTE.text.body,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  scrollContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 40,
  },
  screenTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 32,
    color: PALETTE.text.title,
    marginBottom: 8,
  },
  screenSubtitle: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    lineHeight: 20,
    marginBottom: 20,
  },
  childBanner: {
    marginBottom: 24,
  },
  metaCard: {
    padding: 16,
    gap: 10,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metaLabel: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.text.body,
  },
  metaValue: {
    flexShrink: 1,
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.text.title,
    textAlign: 'right',
  },
  versionBadge: {
    backgroundColor: PALETTE.primaryLight,
    color: PALETTE.primary,
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusBadge: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 11,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusActive: {
    backgroundColor: PALETTE.primaryLight,
    color: PALETTE.primary,
  },
  statusRevoked: {
    backgroundColor: PALETTE.feedback.errorBg,
    color: PALETTE.feedback.error,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: font('medium'),
    fontWeight: '500',
    color: PALETTE.feedback.error,
    fontSize: 13,
    lineHeight: 18,
  },
  authorizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  shieldCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PALETTE.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 18,
    color: PALETTE.text.title,
  },
  bulletList: {
    gap: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 15,
    lineHeight: 22,
    color: PALETTE.text.body,
  },
  readMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
  },
  readMoreText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    color: PALETTE.primary,
  },
  documentLanguageNotice: {
    fontFamily: font('regular'),
    fontSize: 13,
    fontStyle: 'italic',
    color: PALETTE.feedback.warning,
    marginBottom: 8,
  },
  fullTextCard: {
    padding: 16,
    marginTop: 8,
  },
  fullTextBody: {
    fontFamily: font('regular'),
    fontSize: 13,
    lineHeight: 20,
    color: PALETTE.text.body,
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border.subtle,
    marginVertical: 20,
  },
  checkboxGroup: {
    gap: 14,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: PALETTE.border.checkbox,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
  },
  actionsContainer: {
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
  },
  revokeButton: {
    width: BUTTON_WIDTH,
    maxWidth: '100%',
    height: 50,
    backgroundColor: PALETTE.background,
    borderColor: PALETTE.feedback.error,
    borderWidth: 1.5,
    borderRadius: RADIUS_PILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 16,
    color: PALETTE.feedback.error,
  },
});
