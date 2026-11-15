import { Ionicons } from '@expo/vector-icons';
import { MESSAGE_BODY_MAX_LENGTH } from '@nutrikids/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../constants/colors.js';
import { FIELD_HEIGHT, RADIUS_PILL, SCREEN_MARGIN } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import { useAuth } from '../context/auth-context.js';
import { useKeyboardOverlap } from '../hooks/useKeyboardBottomInset.js';
import { useMessageThread } from '../hooks/useMessageThread.js';
import { formatLongDate, formatTime } from '../i18n/format.js';
import { fetchConversations } from '../lib/messages-api.js';
import { ChildBanner } from './ChildBanner.js';

const LOCAL_COLORS = {
  white: '#FFFFFF',
  otherSender: '#9A3412',
  myMeta: '#D1E0DE',
} as const;

const POLL_INTERVAL_MS = 15_000;

export interface ChatThreadProps {
  mode: 'caregiver' | 'professional';
  childId: string | null;
  withUserId: string | null;
  participantName?: string;
  participantRole?: 'CAREGIVER' | 'PROFESSIONAL';
  participantSpecialty?: string | null;
  childFirstName?: string;
  childFullName?: string;
  fallbackRoute: string;
}

function localDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Hilo de chat compartido entre cuidador y profesional (NK-50, RF-19).
 * Refresca cada ~15 s mientras tiene el foco y conserva el texto si falla el envío por red.
 */
export function ChatThread({
  mode,
  childId,
  withUserId,
  participantName,
  participantRole,
  participantSpecialty,
  childFirstName,
  childFullName,
  fallbackRoute,
}: ChatThreadProps) {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'professional', 'common']);
  const { user } = useAuth();
  const containerRef = useRef<React.ComponentRef<typeof View>>(null);
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const { bottomOverlap, updateOverlap } = useKeyboardOverlap(containerRef);
  const [inputText, setInputText] = useState('');
  const [resolvedParticipant, setResolvedParticipant] = useState<{
    name: string;
    role?: 'CAREGIVER' | 'PROFESSIONAL';
    specialty?: string | null;
  } | null>(
    participantName
      ? { name: participantName, role: participantRole, specialty: participantSpecialty ?? null }
      : null,
  );

  const {
    messages,
    loading,
    loadingMore,
    sending,
    hasMore,
    error,
    sendError,
    clearSendError,
    reload,
    refreshSilent,
    loadOlder,
    send,
    retryMessage,
  } = useMessageThread({
    childId,
    withUserId,
    currentUserId: user?.id ?? null,
  });

  // Si la pantalla se abrió solo con childId y withUserId, busca el nombre del participante.
  useEffect(() => {
    if (participantName) {
      setResolvedParticipant({
        name: participantName,
        role: participantRole,
        specialty: participantSpecialty ?? null,
      });
      return;
    }
    if (!childId || !withUserId) return;

    let active = true;
    void fetchConversations({ childId })
      .then((list) => {
        if (!active) return;
        const match = list.find(
          (c) => c.childId === childId && c.participant.userId === withUserId,
        );
        if (match) {
          setResolvedParticipant({
            name: `${match.participant.firstName} ${match.participant.lastName}`.trim(),
            role: match.participant.role,
            specialty: match.participant.specialty,
          });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [childId, participantName, participantRole, participantSpecialty, withUserId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      const timer = setInterval(() => {
        void refreshSilent();
      }, POLL_INTERVAL_MS);
      return () => {
        clearInterval(timer);
      };
    }, [refreshSilent, reload]),
  );

  useEffect(() => {
    if (bottomOverlap > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [bottomOverlap]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as never);
    }
  };

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || trimmed.length > MESSAGE_BODY_MAX_LENGTH || sending) return;

    setInputText('');
    const sent = await send(trimmed);
    if (!sent) {
      setInputText((current) => (current.trim().length === 0 ? trimmed : current));
      return;
    }

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
  };

  const handleRetryMessage = async (messageId: string, body: string) => {
    const sent = await retryMessage(messageId);
    if (sent) {
      setInputText((current) => (current.trim() === body ? '' : current));
    }
  };

  const displayName = resolvedParticipant?.name || t('caregiver:chat.titleFallback');
  const displaySpecialty = resolvedParticipant?.specialty
    ? t(`common:specialties.${resolvedParticipant.specialty}`, {
        defaultValue: resolvedParticipant.specialty,
      })
    : null;

  const screenTitle =
    mode === 'caregiver'
      ? childFirstName
        ? t('caregiver:chat.title', { name: childFirstName })
        : t('caregiver:chat.titleFallback')
      : resolvedParticipant?.name || t('professional:messages.chatTitleFallback');

  const headerPrimary = displaySpecialty
    ? t('caregiver:chat.professional', { name: displayName, specialty: displaySpecialty })
    : displayName;

  const headerSubtitle = childFullName
    ? t('caregiver:chat.about', { name: childFullName })
    : resolvedParticipant?.role === 'CAREGIVER'
      ? t('common:roles.CAREGIVER')
      : null;

  const backButton = (
    <Pressable
      style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
      onPress={handleBack}
      accessibilityRole="button"
      accessibilityLabel={t('caregiver:chat.back')}
      testID="chat-back-button"
    >
      <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
      <Text style={styles.backText}>{t('caregiver:chat.back')}</Text>
    </Pressable>
  );

  if (!childId || !withUserId) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.scrollContent}>
          {backButton}
          <View style={styles.stateBox} testID="chat-missing-params">
            <Ionicons name="alert-circle-outline" size={40} color={PALETTE.text.muted} />
            <Text style={styles.stateText}>{t('caregiver:chat.missingParams')}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const trimmedLength = inputText.trim().length;
  const canSend = trimmedLength > 0 && trimmedLength <= MESSAGE_BODY_MAX_LENGTH && !sending;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View
        ref={containerRef}
        style={[styles.flex, { paddingBottom: bottomOverlap }]}
        onLayout={() => {
          if (bottomOverlap > 0) {
            updateOverlap();
          }
        }}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {backButton}

          <Text style={styles.chatTitle}>{screenTitle}</Text>

          <ChildBanner
            name={headerPrimary}
            subtitle={headerSubtitle ?? undefined}
            style={styles.headerCard}
            testID="chat-context-banner"
          />

          {loading && messages.length === 0 ? (
            <View style={styles.stateBox} testID="chat-loading">
              <ActivityIndicator size="large" color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('caregiver:chat.loading')}</Text>
            </View>
          ) : error && messages.length === 0 ? (
            <View style={styles.stateBox} testID="chat-error">
              <Ionicons name="alert-circle-outline" size={40} color={PALETTE.feedback.error} />
              <Text style={styles.errorStateText}>{error}</Text>
              <Pressable
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                onPress={() => void reload()}
                accessibilityRole="button"
                accessibilityLabel={t('caregiver:chat.retry')}
                testID="chat-retry"
              >
                <Text style={styles.retryButtonText}>{t('caregiver:chat.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {hasMore ? (
                <Pressable
                  style={({ pressed }) => [styles.loadOlderButton, pressed && styles.pressed]}
                  onPress={() => void loadOlder()}
                  disabled={loadingMore}
                  accessibilityRole="button"
                  testID="chat-load-older"
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={PALETTE.primary} />
                  ) : (
                    <Text style={styles.loadOlderText}>{t('caregiver:chat.loadOlder')}</Text>
                  )}
                </Pressable>
              ) : null}

              {messages.length === 0 ? (
                <View style={styles.stateBox} testID="chat-empty">
                  <Text style={styles.stateText}>{t('caregiver:chat.empty')}</Text>
                </View>
              ) : (
                <View style={styles.chatContainer}>
                  {messages.map((item, index) => {
                    const showDate =
                      index === 0 ||
                      localDateKey(item.sentAt) !== localDateKey(messages[index - 1]!.sentAt);
                    const isMine = Boolean(user?.id && item.senderId === user.id);
                    const timeLabel = formatTime(item.sentAt);
                    const statusKey = item.sendStatus
                      ? item.sendStatus
                      : item.readAt
                        ? 'read'
                        : 'sent';

                    return (
                      <React.Fragment key={item.id}>
                        {showDate ? (
                          <Text style={styles.dateSeparator}>{formatLongDate(item.sentAt)}</Text>
                        ) : null}

                        {isMine ? (
                          <View style={styles.myMessageWrapper}>
                            <View
                              style={styles.myMessageBubble}
                              testID={`chat-bubble-mine-${item.id}`}
                            >
                              <Text style={styles.mySenderName}>{t('caregiver:chat.me')}</Text>
                              <Text style={styles.myMessageText}>{item.body}</Text>
                              <View style={styles.myMetaRow}>
                                <Text style={styles.myMetaText}>
                                  {timeLabel} · {t(`caregiver:chat.status.${statusKey}`)}
                                </Text>
                                {item.sendStatus === 'failed' ? (
                                  <Pressable
                                    onPress={() => void handleRetryMessage(item.id, item.body)}
                                    accessibilityRole="button"
                                    testID={`chat-retry-msg-${item.id}`}
                                  >
                                    <Text style={styles.retryInlineText}>
                                      {t('caregiver:chat.retrySend')}
                                    </Text>
                                  </Pressable>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.otherMessageWrapper}>
                            <View
                              style={styles.otherMessageBubble}
                              testID={`chat-bubble-other-${item.id}`}
                            >
                              <Text style={styles.otherSenderName}>{displayName}</Text>
                              <Text style={styles.otherMessageText}>{item.body}</Text>
                              <Text style={styles.otherTimeText}>{timeLabel}</Text>
                            </View>
                          </View>
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.footerContainer}>
          {sendError ? (
            <View style={styles.sendErrorBanner} accessibilityRole="alert" testID="chat-send-error">
              <Text style={styles.sendErrorText}>{sendError}</Text>
            </View>
          ) : null}

          <View style={styles.inputBarRow}>
            <View style={styles.textInputWrapper}>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={(text) => {
                  setInputText(text);
                  if (sendError) clearSendError();
                }}
                placeholder={t('caregiver:chat.inputPlaceholder')}
                placeholderTextColor={PALETTE.input.placeholder}
                maxLength={MESSAGE_BODY_MAX_LENGTH}
                multiline
                accessibilityLabel={t('caregiver:chat.inputA11y')}
                testID="chat-input"
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
                pressed && canSend && styles.sendButtonPressed,
              ]}
              onPress={() => void handleSendMessage()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend, busy: sending }}
              accessibilityLabel={t('caregiver:chat.sendA11y')}
              testID="chat-send-button"
            >
              <Text style={styles.sendButtonText}>{t('caregiver:chat.send')}</Text>
            </Pressable>
          </View>

          {inputText.length >= MESSAGE_BODY_MAX_LENGTH - 200 ? (
            <Text style={styles.charCountText}>
              {t('caregiver:chat.charCount', {
                count: inputText.length,
                max: MESSAGE_BODY_MAX_LENGTH,
              })}
            </Text>
          ) : null}

          <Text style={styles.privacyNote}>
            {mode === 'caregiver'
              ? t('caregiver:chat.privacy')
              : t('professional:messages.chatPrivacy')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 16,
  },
  footerContainer: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: PALETTE.background,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 4,
  },
  backText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 20,
    color: PALETTE.text.body,
  },
  chatTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 32,
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  headerCard: {
    marginBottom: 24,
  },
  loadOlderButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: PALETTE.primary,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  loadOlderText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.primary,
  },
  dateSeparator: {
    fontFamily: font('medium'),
    fontWeight: '500',
    textAlign: 'center',
    fontSize: 13,
    color: PALETTE.text.muted,
    marginBottom: 12,
    marginTop: 4,
  },
  chatContainer: {
    gap: 16,
    marginBottom: 28,
  },
  otherMessageWrapper: {
    alignItems: 'flex-start',
  },
  otherMessageBubble: {
    backgroundColor: PALETTE.secondaryLight,
    borderRadius: RADIUS_PILL,
    borderTopLeftRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxWidth: '85%',
  },
  otherSenderName: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: LOCAL_COLORS.otherSender,
    marginBottom: 6,
  },
  otherMessageText: {
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
    marginBottom: 4,
  },
  otherTimeText: {
    fontFamily: font('regular'),
    fontSize: 11,
    color: PALETTE.text.muted,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  myMessageWrapper: {
    alignItems: 'flex-end',
  },
  myMessageBubble: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    borderTopRightRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxWidth: '85%',
  },
  mySenderName: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: LOCAL_COLORS.white,
    marginBottom: 6,
  },
  myMessageText: {
    fontFamily: font('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: LOCAL_COLORS.white,
    marginBottom: 4,
  },
  myMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  myMetaText: {
    fontFamily: font('regular'),
    fontSize: 11,
    color: LOCAL_COLORS.myMeta,
  },
  retryInlineText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 11,
    color: LOCAL_COLORS.white,
    textDecorationLine: 'underline',
  },
  sendErrorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  sendErrorText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  inputBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 10,
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    paddingHorizontal: 18,
    paddingVertical: 8,
    minHeight: FIELD_HEIGHT,
    maxHeight: 120,
    justifyContent: 'center',
  },
  textInput: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    paddingVertical: 4,
  },
  sendButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    height: FIELD_HEIGHT,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  sendButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: LOCAL_COLORS.white,
    fontSize: 15,
  },
  charCountText: {
    fontFamily: font('regular'),
    fontSize: 11,
    color: PALETTE.text.muted,
    textAlign: 'right',
    marginBottom: 6,
  },
  privacyNote: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorStateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  retryButtonText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: LOCAL_COLORS.white,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
});
