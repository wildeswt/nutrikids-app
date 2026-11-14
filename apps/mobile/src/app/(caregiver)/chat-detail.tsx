import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { DEMO_ACTIVE_CHILD, DEMO_CHAT } from '../../constants/demo-data.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { formatLongDate, formatTime } from '../../i18n/format.js';

interface ChatMessage {
  id: string;
  isMe: boolean;
  content: string;
  time: string;
  status?: 'read' | 'sent';
}

const INITIAL_MESSAGES: ChatMessage[] = DEMO_CHAT.messages;

export default function ChatDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.MESSAGES);
    }
  };

  const handleSendMessage = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      isMe: true,
      content: trimmed,
      time: formatTime(new Date()),
      status: 'sent',
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Botón superior: ‹ Volver */}
          <Pressable
            style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t('chat.back')}
          >
            <Ionicons name="chevron-back" size={20} color={PALETTE.text.title} />
            <Text style={styles.backText}>{t('chat.back')}</Text>
          </Pressable>

          {/* Título de la conversación */}
          <Text style={styles.chatTitle}>
            {t('chat.title', { name: DEMO_ACTIVE_CHILD.firstName })}
          </Text>

          {/* Tarjeta Naranja Superior */}
          <View style={styles.headerCard}>
            <Text style={styles.headerDoctorTitle}>
              {t('chat.professional', {
                name: DEMO_CHAT.professionalName,
                specialty: t(`common:specialties.${DEMO_CHAT.specialty}`),
              })}
            </Text>
            <Text style={styles.headerChildSubtitle}>
              {t('chat.about', { name: DEMO_ACTIVE_CHILD.fullName })}
            </Text>
          </View>

          {/* Separador de fecha */}
          <Text style={styles.dateSeparator}>{formatLongDate(DEMO_CHAT.date)}</Text>

          {/* Lista de burbujas de chat */}
          <View style={styles.chatContainer}>
            {messages.map((item) => {
              if (item.isMe) {
                return (
                  <View key={item.id} style={styles.myMessageWrapper}>
                    <View style={styles.myMessageBubble}>
                      <Text style={styles.mySenderName}>{t('chat.me')}</Text>
                      <Text style={styles.myMessageText}>{item.content}</Text>
                      <View style={styles.myMetaRow}>
                        <Text style={styles.myMetaText}>
                          {item.time}
                          {item.status ? ` · ${t(`chat.status.${item.status}`)}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }

              return (
                <View key={item.id} style={styles.otherMessageWrapper}>
                  <View style={styles.otherMessageBubble}>
                    <Text style={styles.otherSenderName}>{DEMO_CHAT.professionalName}</Text>
                    <Text style={styles.otherMessageText}>{item.content}</Text>
                    <Text style={styles.otherTimeText}>{item.time}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.spacer} />

          {/* Barra de entrada de texto e interactividad de envío */}
          <View style={styles.inputBarRow}>
            <View style={styles.textInputWrapper}>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder={t('chat.inputPlaceholder')}
                placeholderTextColor={PALETTE.input.placeholder}
                accessibilityLabel={t('chat.inputA11y')}
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}
              onPress={handleSendMessage}
              accessibilityRole="button"
              accessibilityLabel={t('chat.sendA11y')}
            >
              <Text style={styles.sendButtonText}>{t('chat.send')}</Text>
            </Pressable>
          </View>

          {/* Pie de privacidad */}
          <Text style={styles.privacyNote}>{t('chat.privacy')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 24,
    minHeight: '100%',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  chatTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  headerCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 22,
    marginBottom: 24,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  headerDoctorTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 3,
  },
  headerChildSubtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
  },
  dateSeparator: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.text.muted,
    marginBottom: 20,
  },
  chatContainer: {
    gap: 16,
    marginBottom: 28,
  },
  otherMessageWrapper: {
    alignItems: 'flex-start',
  },
  otherMessageBubble: {
    backgroundColor: '#FFEADF',
    borderRadius: 22,
    borderTopLeftRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxWidth: '85%',
  },
  otherSenderName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9A3412',
    marginBottom: 6,
  },
  otherMessageText: {
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.text.body,
    marginBottom: 4,
  },
  otherTimeText: {
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
    borderRadius: 22,
    borderTopRightRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxWidth: '85%',
  },
  mySenderName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  myMessageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  myMetaRow: {
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  myMetaText: {
    fontSize: 11,
    color: '#D1E0DE',
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  inputBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 18,
    height: 52,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 15,
    color: PALETTE.text.body,
    paddingVertical: 6,
  },
  sendButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 26,
    height: 52,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  sendButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  privacyNote: {
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.75,
  },
});
