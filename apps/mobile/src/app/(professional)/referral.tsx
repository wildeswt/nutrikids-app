import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse, ProfessionalAssignmentResponse } from '@nutrikids/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { useReferral } from '../../hooks/useReferral.js';
import { formatChildAge } from '../../lib/children-api.js';
import {
  REFERRAL_PRIORITIES,
  maxReasonLength,
  type ReferralFormError,
} from '../../lib/referral-form.js';

// Colores del diseño en Figma (428x926) que difieren de PALETTE (sin modificar constants/colors.ts).
const DESIGN_COLORS = {
  background: '#FBFBFB',
  inputBg: '#F9F9F9',
  inputBorder: '#ECECEC',
} as const;

const SEND_CONFIRMATION_DELAY_MS = 900;

export default function ReferralScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();
  const { user } = useAuth();
  const { childId: initialChildId } = useLocalSearchParams<{ childId?: string }>();

  const referral = useReferral({ initialChildId });
  const { load } = referral;

  const [showChildMenu, setShowChildMenu] = useState(false);
  const [showRecipientMenu, setShowRecipientMenu] = useState(false);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (backTimerRef.current) {
        clearTimeout(backTimerRef.current);
      }
    };
  }, []);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.PROFESSIONAL.ALERTS);
    }
  };

  const handleSubmit = async () => {
    const ok = await referral.submit();
    if (ok) {
      backTimerRef.current = setTimeout(goBack, SEND_CONFIRMATION_DELAY_MS);
    }
  };

  const formatChildOption = (child: ChildResponse): string =>
    `${child.firstName} ${child.lastName} · ${formatChildAge(child.birthDate)}`;

  const formatProfessionalOption = (assignment: ProfessionalAssignmentResponse): string => {
    const fullName =
      [assignment.firstName, assignment.lastName].filter(Boolean).join(' ') ||
      t('referral.unknownProfessional');
    if (!assignment.specialty) return fullName;
    const specialtyLabel = t(`common:specialties.${assignment.specialty}`, {
      defaultValue: assignment.specialty,
    });
    return `${specialtyLabel} · ${fullName}`;
  };

  const formErrorText = (error: ReferralFormError | null): string | null => {
    if (!error) return null;
    if (error.code === 'bodyTooLong') {
      return t('referral.errors.bodyTooLong', { max: error.max });
    }
    return t(`referral.errors.${error.code}`);
  };

  const doctorName = user ? `${user.firstName} ${user.lastName}` : '';
  const specialtyLabel = user?.specialty
    ? t(`common:specialties.${user.specialty}`, { defaultValue: user.specialty })
    : null;
  const bannerSubtitle = specialtyLabel
    ? t('referral.bannerSubtitle', { name: doctorName, specialty: specialtyLabel })
    : doctorName;

  const header = (
    <>
      <Pressable
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        onPress={goBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common:actions.goBack')}
        testID="referral-back"
      >
        <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        <Text style={styles.backText}>{t('common:actions.back')}</Text>
      </Pressable>
      <Text style={styles.screenTitle}>{t('referral.title')}</Text>
    </>
  );

  if (referral.loadingChildren || referral.childrenError || referral.children.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content} testID="referral-screen">
          {header}
          {referral.loadingChildren ? (
            <View style={styles.centerBox} testID="referral-loading">
              <ActivityIndicator size="large" color={PALETTE.primary} />
              <Text style={styles.mutedText}>{t('referral.loadingChildren')}</Text>
            </View>
          ) : referral.childrenError ? (
            <View style={styles.centerBox} testID="referral-children-error">
              <Ionicons name="alert-circle" size={48} color={PALETTE.feedback.error} />
              <Text style={styles.errorText}>{referral.childrenError}</Text>
              <Pressable
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                onPress={() => void load()}
                accessibilityRole="button"
                testID="referral-retry-children"
              >
                <Text style={styles.retryButtonText}>{t('referral.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.centerBox} testID="referral-empty-children">
              <Text style={styles.emptyTitle}>{t('referral.emptyChildrenTitle')}</Text>
              <Text style={styles.mutedText}>{t('referral.emptyChildrenSubtitle')}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const activeChild = referral.children.find((item) => item.id === referral.form.childId) ?? null;
  const activeRecipient =
    referral.recipients.find((item) => item.professionalId === referral.form.recipientId) ?? null;
  const reasonMax = maxReasonLength(referral.form.priority);
  const reasonLength = referral.form.reason.length;
  const isOverLimit = reasonLength > reasonMax;
  const validationMessage = formErrorText(referral.formError);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="referral-screen">
          {header}

          <ChildBanner name={t('referral.bannerTitle')} subtitle={bannerSubtitle} />

          {referral.notice === 'draftRestored' ? (
            <Text style={styles.noticeText} testID="referral-draft-restored">
              {t('referral.draftRestored')}
            </Text>
          ) : null}

          {/* Paciente */}
          <View style={styles.fieldGroup}>
            <Text style={styles.sectionTitle}>{t('referral.patientLabel')}</Text>
            <Pressable
              style={({ pressed }) => [styles.selectorPill, pressed && styles.pressed]}
              onPress={() => {
                setShowChildMenu((open) => !open);
                setShowRecipientMenu(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('referral.patientLabel')}
              accessibilityState={{ expanded: showChildMenu }}
              testID="referral-child-selector"
            >
              <Text
                style={activeChild ? styles.selectorValue : styles.selectorPlaceholder}
                numberOfLines={1}
              >
                {activeChild ? formatChildOption(activeChild) : t('referral.patientPlaceholder')}
              </Text>
              <Ionicons
                name={showChildMenu ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={PALETTE.text.body}
              />
            </Pressable>
            {showChildMenu ? (
              <View style={styles.dropdownMenu} testID="referral-child-menu">
                {referral.children.map((child) => {
                  const selected = child.id === referral.form.childId;
                  return (
                    <Pressable
                      key={child.id}
                      style={[styles.dropdownOption, selected && styles.dropdownOptionSelected]}
                      onPress={() => {
                        referral.selectChild(child.id);
                        setShowChildMenu(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      testID={`referral-child-option-${child.id}`}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          selected && styles.dropdownOptionTextSelected,
                        ]}
                      >
                        {formatChildOption(child)}
                      </Text>
                      {selected ? (
                        <Ionicons name="checkmark" size={18} color={PALETTE.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Dirigida a */}
          <View style={styles.fieldGroup}>
            <Text style={styles.sectionTitle}>{t('referral.recipientLabel')}</Text>
            {referral.loadingRecipients ? (
              <View style={styles.recipientStatusBox} testID="referral-recipients-loading">
                <ActivityIndicator size="small" color={PALETTE.primary} />
                <Text style={styles.mutedText}>{t('referral.loadingRecipients')}</Text>
              </View>
            ) : referral.recipientsError ? (
              <View style={styles.errorBanner} testID="referral-recipients-error">
                <Text style={styles.errorBannerText}>{referral.recipientsError}</Text>
                <Pressable
                  style={({ pressed }) => [styles.inlineRetryButton, pressed && styles.pressed]}
                  onPress={() => void referral.reloadRecipients()}
                  accessibilityRole="button"
                  testID="referral-recipients-retry"
                >
                  <Text style={styles.inlineRetryText}>{t('referral.retry')}</Text>
                </Pressable>
              </View>
            ) : referral.recipients.length === 0 ? (
              <View style={styles.emptyRecipientBanner} testID="referral-no-recipients">
                <Text style={styles.emptyRecipientText}>{t('referral.noRecipients')}</Text>
              </View>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [styles.selectorPill, pressed && styles.pressed]}
                  onPress={() => {
                    setShowRecipientMenu((open) => !open);
                    setShowChildMenu(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('referral.recipientLabel')}
                  accessibilityState={{ expanded: showRecipientMenu }}
                  testID="referral-recipient-selector"
                >
                  <Text
                    style={activeRecipient ? styles.selectorValue : styles.selectorPlaceholder}
                    numberOfLines={1}
                  >
                    {activeRecipient
                      ? formatProfessionalOption(activeRecipient)
                      : t('referral.recipientPlaceholder')}
                  </Text>
                  <Ionicons
                    name={showRecipientMenu ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color={PALETTE.text.body}
                  />
                </Pressable>
                {showRecipientMenu ? (
                  <View style={styles.dropdownMenu} testID="referral-recipient-menu">
                    {referral.recipients.map((assignment) => {
                      const selected = assignment.professionalId === referral.form.recipientId;
                      return (
                        <Pressable
                          key={assignment.professionalId}
                          style={[styles.dropdownOption, selected && styles.dropdownOptionSelected]}
                          onPress={() => {
                            referral.setForm({ recipientId: assignment.professionalId });
                            setShowRecipientMenu(false);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          testID={`referral-recipient-option-${assignment.professionalId}`}
                        >
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              selected && styles.dropdownOptionTextSelected,
                            ]}
                          >
                            {formatProfessionalOption(assignment)}
                          </Text>
                          {selected ? (
                            <Ionicons name="checkmark" size={18} color={PALETTE.primary} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* Motivo de la interconsulta */}
          <View style={styles.fieldGroup}>
            <Text style={styles.sectionTitle}>{t('referral.reasonLabel')}</Text>
            <View style={styles.reasonBox}>
              <KeyboardAwareTextInput
                style={styles.reasonInput}
                value={referral.form.reason}
                onChangeText={(reason) => referral.setForm({ reason })}
                placeholder={t('referral.reasonPlaceholder')}
                placeholderTextColor={PALETTE.input.placeholder}
                multiline
                textAlignVertical="top"
                accessibilityLabel={t('referral.reasonLabel')}
                testID="referral-reason"
              />
            </View>
            <Text
              style={[styles.charCount, isOverLimit && styles.charCountOver]}
              testID="referral-char-count"
            >
              {t('referral.charCount', { count: reasonLength, max: reasonMax })}
            </Text>
          </View>

          {/* Prioridad */}
          <View style={styles.fieldGroup}>
            <Text style={styles.sectionTitle}>{t('referral.priorityLabel')}</Text>
            <View style={styles.priorityRow}>
              {REFERRAL_PRIORITIES.map((option) => {
                const active = referral.form.priority === option;
                return (
                  <Pressable
                    key={option}
                    style={({ pressed }) => [
                      styles.priorityButton,
                      active ? styles.priorityButtonActive : styles.priorityButtonInactive,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => referral.setForm({ priority: option })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    testID={`referral-priority-${option}`}
                  >
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={PALETTE.text.light} />
                    ) : null}
                    <Text style={active ? styles.priorityTextActive : styles.priorityTextInactive}>
                      {t(`referral.priorities.${option}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* NOTE: La opción «Incluir historial y último control» del diseño en Figma no se muestra
              porque POST /referrals no admite adjuntos y el profesional destinatario ya tiene
              acceso al historial del niño mediante su vínculo activo. */}

          {validationMessage ? (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              testID="referral-validation-error"
            >
              <Text style={styles.errorBannerText}>{validationMessage}</Text>
            </View>
          ) : null}

          {referral.apiError ? (
            <View style={styles.errorBanner} accessibilityRole="alert" testID="referral-api-error">
              <Text style={styles.errorBannerText}>{referral.apiError}</Text>
            </View>
          ) : null}

          {referral.notice === 'sent' ? (
            <View style={styles.successBanner} testID="referral-sent-notice">
              <Text style={styles.successBannerText}>{t('referral.sentSuccess')}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                !referral.canSubmit && styles.primaryButtonDisabled,
                pressed && referral.canSubmit && styles.pressed,
              ]}
              onPress={() => void handleSubmit()}
              disabled={!referral.canSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !referral.canSubmit, busy: referral.sending }}
              testID="referral-submit"
            >
              <Text style={styles.primaryButtonText}>
                {referral.sending ? t('referral.actions.sending') : t('referral.actions.submit')}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              onPress={() => void referral.saveDraft()}
              disabled={referral.sending}
              accessibilityRole="button"
              accessibilityState={{ disabled: referral.sending }}
              testID="referral-save-draft"
            >
              <Text style={styles.secondaryButtonText}>{t('referral.actions.saveDraft')}</Text>
            </Pressable>

            {referral.notice === 'draftSaved' ? (
              <Text style={styles.noticeText} testID="referral-draft-saved">
                {t('referral.draftSaved')}
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DESIGN_COLORS.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  content: {
    width: '100%',
    maxWidth: 428,
    alignSelf: 'center',
    paddingHorizontal: 30,
    paddingTop: 12,
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: {
    fontSize: 20,
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  fieldGroup: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  selectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DESIGN_COLORS.inputBg,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.inputBorder,
    borderRadius: 25,
    minHeight: 50,
    paddingHorizontal: 20,
    gap: 8,
  },
  selectorValue: {
    flex: 1,
    fontSize: 16,
    color: PALETTE.text.body,
  },
  selectorPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: PALETTE.input.placeholder,
  },
  dropdownMenu: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.inputBorder,
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 8,
  },
  dropdownOptionSelected: {
    backgroundColor: PALETTE.primaryLight,
  },
  dropdownOptionText: {
    flex: 1,
    fontSize: 15,
    color: PALETTE.text.body,
  },
  dropdownOptionTextSelected: {
    fontWeight: '600',
    color: PALETTE.primary,
  },
  recipientStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: DESIGN_COLORS.inputBg,
    borderRadius: 25,
    minHeight: 50,
    paddingHorizontal: 20,
  },
  emptyRecipientBanner: {
    backgroundColor: PALETTE.feedback.warningBg,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  emptyRecipientText: {
    fontSize: 14,
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  reasonBox: {
    backgroundColor: DESIGN_COLORS.inputBg,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.inputBorder,
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 112,
  },
  reasonInput: {
    fontSize: 16,
    color: PALETTE.text.body,
    minHeight: 84,
  },
  charCount: {
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'right',
    paddingRight: 8,
  },
  charCountOver: {
    color: PALETTE.feedback.error,
    fontWeight: '600',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 14,
  },
  priorityButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  priorityButtonActive: {
    backgroundColor: PALETTE.primary,
  },
  priorityButtonInactive: {
    backgroundColor: DESIGN_COLORS.inputBg,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.inputBorder,
  },
  priorityTextActive: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.light,
  },
  priorityTextInactive: {
    fontSize: 15,
    fontWeight: '500',
    color: PALETTE.text.body,
  },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  errorBannerText: {
    fontSize: 14,
    color: PALETTE.feedback.error,
  },
  inlineRetryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  inlineRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.primary,
    textDecorationLine: 'underline',
  },
  successBanner: {
    backgroundColor: PALETTE.feedback.successBg,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  successBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.feedback.success,
    textAlign: 'center',
  },
  noticeText: {
    fontSize: 13,
    color: PALETTE.primary,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    width: 318,
    maxWidth: '100%',
    alignSelf: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: 25,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: 318,
    maxWidth: '100%',
    alignSelf: 'center',
    backgroundColor: DESIGN_COLORS.background,
    borderWidth: 2,
    borderColor: PALETTE.primary,
    borderRadius: 25,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: PALETTE.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  centerBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  mutedText: {
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
  },
  retryButtonText: {
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
