import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';

interface MessageThread {
  id: string;
  title: string;
  subtitle: string;
  preview: string;
  time: string;
  unreadCount?: number;
}

const ALL_MESSAGES: MessageThread[] = [
  {
    id: 'thread-1',
    title: 'Equipo de Mateo',
    subtitle: 'Nutrición · Dra. Laura Pérez',
    preview: 'Gracias, Andrea. Revisaremos el registro.',
    time: '09:40',
    unreadCount: 1,
  },
  {
    id: 'thread-2',
    title: 'Equipo de Valentina',
    subtitle: 'Enfermería · Lic. Ana Torres',
    preview: 'Te esperamos en el próximo control.',
    time: 'Ayer',
    unreadCount: 1,
  },
  {
    id: 'thread-3',
    title: 'Centro de salud',
    subtitle: 'Atención al usuario',
    preview: 'Tu cita está confirmada para el 25 oct.',
    time: '16 oct',
    unreadCount: 0,
  },
];

export default function MessagesScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredMessages =
    filter === 'unread' ? ALL_MESSAGES.filter((msg) => (msg.unreadCount ?? 0) > 0) : ALL_MESSAGES;

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
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={20} color={PALETTE.text.title} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        {/* Título de la pantalla */}
        <Text style={styles.screenTitle}>Mensajes</Text>

        {/* Banner naranja informativo */}
        <View style={styles.bannerCard}>
          <Text style={styles.bannerText}>Conversa con tu equipo de salud.</Text>
        </View>

        {/* Filtro Todos / Sin leer */}
        <View style={styles.filterPillContainer}>
          <Pressable
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
            accessibilityRole="button"
            accessibilityLabel="Ver todos los mensajes"
          >
            <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              Todos
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
            onPress={() => setFilter('unread')}
            accessibilityRole="button"
            accessibilityLabel="Ver mensajes sin leer"
          >
            <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
              Sin leer (2)
            </Text>
          </Pressable>
        </View>

        {/* Lista de hilos de conversación */}
        <View style={styles.threadsList}>
          {filteredMessages.map((thread) => (
            <Pressable
              key={thread.id}
              style={({ pressed }) => [styles.threadItem, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Mensaje de ${thread.title}`}
            >
              <View style={styles.threadMainRow}>
                <View style={styles.threadContent}>
                  <Text style={styles.threadTitle}>{thread.title}</Text>
                  <Text style={styles.threadSubtitle}>{thread.subtitle}</Text>
                  <Text style={styles.threadPreview}>{thread.preview}</Text>
                </View>

                <View style={styles.threadMetaColumn}>
                  <Text style={styles.threadTime}>{thread.time}</Text>
                  {thread.unreadCount && thread.unreadCount > 0 ? (
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
        <Text style={styles.disclaimerText}>
          Este canal no atiende urgencias. Si necesitas atención inmediata, acude a tu centro de
          salud.
        </Text>

        {/* Botón Nuevo mensaje */}
        <Pressable
          style={({ pressed }) => [styles.newMsgButton, pressed && styles.newMsgButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Nuevo mensaje"
        >
          <Text style={styles.newMsgButtonText}>Nuevo mensaje</Text>
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
