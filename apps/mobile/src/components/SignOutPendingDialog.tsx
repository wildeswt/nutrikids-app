import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { BUTTON_HEIGHT, CARD_SHADOW, RADIUS_PILL } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import type { SignOutPendingDialogProps } from '../hooks/useSignOutFlow.js';
import { PrimaryButton } from './ui/PrimaryButton.js';

/**
 * Diálogo modal que advierte sobre registros clínicos o alimenticios sin sincronizar
 * antes de cerrar sesión manualmente, evitando pérdida involuntaria de datos.
 */
export function SignOutPendingDialog({
  visible,
  unsentCount,
  isOnline,
  confirmDeleteStep,
  busyAction,
  syncFailedCount,
  canGoToPendingSync,
  onSyncAndSignOut,
  onRequestDeleteConfirm,
  onConfirmDeleteAndSignOut,
  onGoToPendingSync,
  onCancel,
}: SignOutPendingDialogProps) {
  const { t } = useTranslation('common');
  const isBusy = busyAction !== null;
  const syncLabel =
    busyAction === 'sync' ? t('signOutPending.syncing') : t('signOutPending.syncAndSignOut');
  const signingOutLabel = t('signOutPending.signingOut');
  const confirmDeleteLabel = t('signOutPending.confirmDeleteAction');
  const signOutDeleteLabel = t('signOutPending.signOutAndDelete');
  const goQueueLabel = t('signOutPending.goToPendingSync');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
      testID="sign-out-pending-modal"
    >
      <View style={styles.backdrop} accessible={false}>
        <View style={styles.card} accessibilityViewIsModal testID="sign-out-pending-dialog">
          <View style={styles.topRow}>
            <View style={[styles.iconBadge, confirmDeleteStep && styles.iconBadgeDanger]}>
              <Ionicons
                name={confirmDeleteStep ? 'warning-outline' : 'cloud-offline-outline'}
                size={24}
                color={confirmDeleteStep ? PALETTE.feedback.error : PALETTE.secondary}
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && !isBusy && styles.buttonPressed,
              ]}
              onPress={onCancel}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={t('signOutPending.closeA11y')}
              accessibilityState={{ disabled: isBusy }}
              testID="sign-out-pending-close"
            >
              <Ionicons name="close" size={20} color={PALETTE.text.muted} />
            </Pressable>
          </View>

          {confirmDeleteStep ? (
            <>
              <Text style={styles.title} testID="sign-out-pending-confirm-title">
                {t('signOutPending.confirmDeleteTitle')}
              </Text>
              <Text style={styles.body} testID="sign-out-pending-confirm-body">
                {t('signOutPending.confirmDeleteBody', { count: unsentCount })}
              </Text>

              <View style={styles.actionsColumn}>
                <Pressable
                  style={({ pressed }) => [
                    styles.confirmDeleteButton,
                    isBusy && styles.disabledButton,
                    pressed && !isBusy && styles.buttonPressed,
                  ]}
                  onPress={onConfirmDeleteAndSignOut}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel={confirmDeleteLabel}
                  accessibilityState={{ disabled: isBusy, busy: busyAction === 'delete' }}
                  testID="sign-out-pending-confirm-delete-btn"
                >
                  {busyAction === 'delete' ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={PALETTE.text.light} />
                      <Text style={styles.confirmDeleteText}>{signingOutLabel}</Text>
                    </View>
                  ) : (
                    <Text style={styles.confirmDeleteText}>{confirmDeleteLabel}</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title} testID="sign-out-pending-title">
                {t('signOutPending.title', { count: unsentCount })}
              </Text>
              <Text style={styles.body} testID="sign-out-pending-body">
                {t('signOutPending.body')}
              </Text>

              {syncFailedCount !== null && syncFailedCount > 0 ? (
                <View style={styles.errorBanner} testID="sign-out-pending-error-banner">
                  <Text style={styles.errorBannerText} testID="sign-out-pending-sync-error">
                    {t('signOutPending.syncFailed', { count: syncFailedCount })}
                  </Text>
                  {canGoToPendingSync ? (
                    <Pressable
                      onPress={onGoToPendingSync}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={goQueueLabel}
                      accessibilityState={{ disabled: isBusy }}
                      testID="sign-out-pending-go-queue"
                    >
                      <Text style={styles.errorQueueLink}>{goQueueLabel}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actionsColumn}>
                <View style={styles.syncBlock}>
                  <PrimaryButton
                    label={syncLabel}
                    onPress={onSyncAndSignOut}
                    loading={busyAction === 'sync'}
                    disabled={!isOnline || isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={t('signOutPending.syncAndSignOut')}
                    style={styles.fullWidthPrimary}
                    testID="sign-out-pending-sync-btn"
                  />
                  {!isOnline ? (
                    <Text style={styles.offlineHint} testID="sign-out-pending-offline-hint">
                      {t('signOutPending.offlineHint')}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.destructiveOutlineButton,
                    isBusy && styles.disabledButton,
                    pressed && !isBusy && styles.buttonPressed,
                  ]}
                  onPress={onRequestDeleteConfirm}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel={signOutDeleteLabel}
                  accessibilityState={{ disabled: isBusy }}
                  testID="sign-out-pending-delete-btn"
                >
                  <Text style={styles.destructiveOutlineText}>{signOutDeleteLabel}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 24,
    ...CARD_SHADOW,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PALETTE.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeDanger: {
    backgroundColor: PALETTE.feedback.errorBg,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
    marginTop: -6,
  },
  title: {
    fontFamily: font('semibold'),
    fontSize: 18,
    lineHeight: 24,
    color: PALETTE.text.title,
    marginBottom: 8,
  },
  body: {
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.muted,
    marginBottom: 20,
  },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  errorBannerText: {
    fontFamily: font('medium'),
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
  errorQueueLink: {
    fontFamily: font('semibold'),
    fontSize: 13,
    color: PALETTE.primary,
    textDecorationLine: 'underline',
  },
  actionsColumn: {
    gap: 10,
  },
  syncBlock: {
    gap: 6,
  },
  fullWidthPrimary: {
    width: '100%',
  },
  offlineHint: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  destructiveOutlineButton: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS_PILL,
    borderWidth: 1.5,
    borderColor: PALETTE.feedback.error,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  destructiveOutlineText: {
    fontFamily: font('semibold'),
    fontSize: 15,
    color: PALETTE.feedback.error,
  },
  confirmDeleteButton: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.feedback.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmDeleteText: {
    fontFamily: font('semibold'),
    fontSize: 15,
    color: PALETTE.text.light,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
