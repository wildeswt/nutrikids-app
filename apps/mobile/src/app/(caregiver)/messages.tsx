import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { DEMO_THREADS, type DemoThread } from '../../constants/demo-data.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { formatShortDate } from '../../i18n/format.js';

export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const threads = DEMO_THREADS.map((thread: DemoThread) => ({
    ...thread,
    title:
      thread.source.kind === 'childTeam'
        ? t('messages.childTeam', { name: thread.source.childName })
        : t('messages.healthCenter'),
    subtitle:
      thread.source.kind === 'childTeam'
        ? t('messages.teamSubtitle', {
            specialty: t(`common:specialties.${thread.source.specialty}`),
            professional: thread.source.professionalName,
          })
        : t('messages.healthCenterSubtitle'),
    timeLabel:
      thread.time.kind === 'time'
        ? thread.time.value
        : thread.time.kind === 'yesterday'
          ? t('common:time.yesterday')
          : formatShortDate(thread.time.value),
  }));
  const unreadTotal = threads.filter((thread) => thread.unreadCount > 0).length;

  const filteredMessages =
    filter === 'unread' ? threads.filter((msg) => msg.unreadCount > 0) : threads;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Botón superior: ‹ Volver */}
        <Pressable
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('messages.back')}
        >
          <Ionicons name="chevron-back" size={20} color={PALETTE.text.title} />
          <Text style={styles.backText}>{t('messages.back')}</Text>
        </Pressable>

        {/* Título de la pantalla */}
        <Text style={styles.screenTitle}>{t('messages.title')}</Text>

        {/* Banner naranja informativo */}
        <View style={styles.bannerCard}>
          <Text style={styles.bannerText}>{t('messages.banner')}</Text>
        </View>

        {/* Filtro Todos / Sin leer */}
        <View style={styles.filterPillContainer}>
          <Pressable
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
            accessibilityRole="button"
            accessibilityLabel={t('messages.filterAllA11y')}
          >
            <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              {t('messages.filterAll')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
            onPress={() => setFilter('unread')}
            accessibilityRole="button"
            accessibilityLabel={t('messages.filterUnreadA11y')}
          >
            <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
              {t('messages.filterUnread', { count: unreadTotal })}
            </Text>
          </Pressable>
        </View>

        {/* Lista de hilos de conversación */}
        <View style={styles.threadsList}>
          {filteredMessages.map((thread) => (
            <Pressable
              key={thread.id}
              style={({ pressed }) => [styles.threadItem, pressed && styles.pressed]}
              onPress={() => router.push(APP_ROUTES.CAREGIVER.CHAT_DETAIL)}
              accessibilityRole="button"
              accessibilityLabel={t('messages.threadA11y', { title: thread.title })}
            >
              <View style={styles.threadMainRow}>
                <View style={styles.threadContent}>
                  <Text style={styles.threadTitle}>{thread.title}</Text>
                  <Text style={styles.threadSubtitle}>{thread.subtitle}</Text>
                  <Text style={styles.threadPreview}>{thread.preview}</Text>
                </View>

                <View style={styles.threadMetaColumn}>
                  <Text style={styles.threadTime}>{thread.timeLabel}</Text>
                  {thread.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{thread.unreadCount}</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyBadgePlaceholder} />
                  )}
                </View>
              </View>

              <View style={styles.threadDivider} />
            </Pressable>
          ))}
        </View>

        {/* Disclaimer médico / de urgencias */}
        <Text style={styles.disclaimerText}>{t('messages.emergencyNotice')}</Text>

        {/* Botón Nuevo mensaje */}
        <Pressable
          style={({ pressed }) => [styles.newMsgButton, pressed && styles.newMsgButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('messages.newMessage')}
        >
          <Text style={styles.newMsgButtonText}>{t('messages.newMessage')}</Text>
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
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
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
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  bannerCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 18,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  filterPillContainer: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#FFEADF',
    borderRadius: 22,
    padding: 3,
    marginBottom: 24,
  },
  filterTab: {
    paddingVertical: 7,
    paddingHorizontal: 28,
    borderRadius: 18,
  },
  filterTabActive: {
    backgroundColor: PALETTE.secondary,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  threadsList: {
    marginBottom: 28,
  },
  threadItem: {
    paddingVertical: 6,
  },
  threadMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  threadContent: {
    flex: 1,
    paddingRight: 12,
  },
  threadTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: PALETTE.primary,
    marginBottom: 3,
  },
  threadSubtitle: {
    fontSize: 12,
    color: PALETTE.text.muted,
    marginBottom: 6,
  },
  threadPreview: {
    fontSize: 14,
    color: PALETTE.text.body,
    lineHeight: 19,
  },
  threadMetaColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  threadTime: {
    fontSize: 12,
    color: PALETTE.text.muted,
    marginBottom: 8,
  },
  unreadBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PALETTE.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBadgePlaceholder: {
    width: 22,
    height: 22,
  },
  threadDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 18,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    color: PALETTE.text.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 28,
  },
  newMsgButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 28,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  newMsgButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  newMsgButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
