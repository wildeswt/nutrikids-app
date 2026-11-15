import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaregiverChildCard } from '../../components/CaregiverChildCard.js';
import { OfflineDataNotice } from '../../components/OfflineDataNotice.js';
import { Card } from '../../components/ui/Card.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import { CARD_SHADOW, RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useActiveChildId } from '../../hooks/useActiveChild.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useChildrenProfessionals } from '../../hooks/useChildrenProfessionals.js';
import { useEducation } from '../../hooks/useEducation.js';
import { formatRelativeMessageTime, useHomeSummary } from '../../hooks/useHomeSummary.js';
import { useNotifications } from '../../hooks/useNotifications.js';
import { formatLongDate, formatTime } from '../../i18n/format.js';
import { childAgeMonths, filterByAge, readingMinutes } from '../../lib/education.js';

const KNOWN_REMINDER_TYPES = ['checkup', 'activity', 'next_checkup'] as const;

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const { user } = useAuth();
  const activeChildId = useActiveChildId();
  const { status, children, error, fromCache, stale, lastSyncedAt, loadError, load } =
    useChildren();
  const { professionals, load: loadProfessionals } = useChildrenProfessionals();
  const education = useEducation();
  const loadEducation = education.load;
  const { unreadCount, reload: reloadNotifications } = useNotifications();
  const {
    messageStatus,
    latestMessage,
    messageError,
    reminderStatus,
    nextReminder,
    reminderError,
    load: loadHomeSummary,
  } = useHomeSummary();

  // Recarga niños, artículos, notificaciones y resumen al enfocar la pestaña Inicio
  useFocusEffect(
    useCallback(() => {
      void load();
      void loadEducation();
      void reloadNotifications();
      void loadHomeSummary();
    }, [load, loadEducation, reloadNotifications, loadHomeSummary]),
  );

  const activeChild = children.find((item) => item.id === activeChildId) ?? children[0] ?? null;

  // Profesionales vigentes del niño activo (para mostrarlos o invitar a vincular uno)
  const activeChildKey = activeChild?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (activeChildKey) void loadProfessionals([{ id: activeChildKey }]);
    }, [activeChildKey, loadProfessionals]),
  );

  // Artículos mostrados en Inicio: según la edad del niño activo, o los primeros del catálogo
  const learnArticles = (() => {
    if (!activeChild) return education.articles.slice(0, 2);
    const forAge = filterByAge(education.articles, childAgeMonths(activeChild));
    return (forAge.length > 0 ? forAge : education.articles).slice(0, 2);
  })();

  const caregiverName = user?.firstName || t('home.greetingFallback');
  const greetingText = t('home.greeting', { name: caregiverName });

  const handleRegisterChild = () => {
    // Muestra la pantalla de consentimiento antes de registrar al niño (NK-20)
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { mode: 'register' },
    });
  };

  const renderForYouCard = () => {
    if (messageStatus === 'idle' || messageStatus === 'loading') {
      return (
        <Card style={styles.discreteCard} testID="home-message-loading">
          <View style={styles.discreteRow}>
            <ActivityIndicator size="small" color={PALETTE.primary} />
            <Text style={styles.discreteText}>{t('home.messageLoading')}</Text>
          </View>
        </Card>
      );
    }

    if (messageStatus === 'error') {
      return (
        <Card style={styles.discreteCard} testID="home-message-error">
          <View style={styles.discreteErrorRow}>
            <Text style={styles.discreteErrorText}>{messageError || t('home.messageError')}</Text>
            <Pressable
              onPress={() => void loadHomeSummary()}
              accessibilityRole="button"
              testID="home-message-retry"
            >
              <Text style={styles.sectionLink}>{t('home.retry')}</Text>
            </Pressable>
          </View>
        </Card>
      );
    }

    if (messageStatus === 'empty' || !latestMessage) {
      return (
        <Pressable
          style={({ pressed }) => [styles.sectionCardPressable, pressed && styles.buttonPressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}
          testID="home-message-empty"
        >
          <Card>
            <View style={styles.messageCardRow}>
              <Ionicons name="chatbubbles" size={30} color={PALETTE.secondary} />
              <Text style={styles.discreteText}>{t('home.messageEmpty')}</Text>
            </View>
          </Card>
        </Pressable>
      );
    }

    return (
      <Pressable
        style={({ pressed }) => [styles.sectionCardPressable, pressed && styles.buttonPressed]}
        onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}
        testID="home-message-card"
      >
        <Card>
          <View style={styles.messageCardRow}>
            <Ionicons
              name="chatbubbles"
              size={34}
              color={PALETTE.secondary}
              style={styles.messageIcon}
            />
            <View style={styles.messageContent}>
              <Text style={styles.messageTitle}>{t('home.messageTitle')}</Text>
              <Text style={styles.messageQuote} numberOfLines={2}>
                {t('home.messageQuote', { text: latestMessage.body })}
              </Text>
              <Text style={styles.messageMeta}>
                {t('home.messageMeta', {
                  when: formatRelativeMessageTime(latestMessage.sentAt),
                  author: latestMessage.senderName,
                })}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  const renderNextCheckupCard = () => {
    if (reminderStatus === 'idle' || reminderStatus === 'loading') {
      return (
        <Card style={styles.discreteCard} testID="home-checkup-loading">
          <View style={styles.discreteRow}>
            <ActivityIndicator size="small" color={PALETTE.primary} />
            <Text style={styles.discreteText}>{t('home.checkupLoading')}</Text>
          </View>
        </Card>
      );
    }

    if (reminderStatus === 'error') {
      return (
        <Card style={styles.discreteCard} testID="home-checkup-error">
          <View style={styles.discreteErrorRow}>
            <Text style={styles.discreteErrorText}>{reminderError || t('home.checkupError')}</Text>
            <Pressable
              onPress={() => void loadHomeSummary()}
              accessibilityRole="button"
              testID="home-checkup-retry"
            >
              <Text style={styles.sectionLink}>{t('home.retry')}</Text>
            </Pressable>
          </View>
        </Card>
      );
    }

    if (reminderStatus === 'empty' || !nextReminder) {
      return (
        <Pressable
          style={({ pressed }) => [styles.sectionCardPressable, pressed && styles.buttonPressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.REMINDERS)}
          testID="home-checkup-empty"
        >
          <Card>
            <View style={styles.messageCardRow}>
              <Ionicons name="calendar-outline" size={28} color={PALETTE.secondary} />
              <Text style={styles.discreteText}>{t('home.checkupEmpty')}</Text>
            </View>
          </Card>
        </Pressable>
      );
    }

    const knownType = KNOWN_REMINDER_TYPES.find((item) => item === nextReminder.type);
    const reminderTitle = t(`reminders.types.${knownType ?? 'other'}`);
    const scheduledDate = new Date(nextReminder.scheduledFor);

    return (
      <Pressable
        style={({ pressed }) => [styles.controlCard, pressed && styles.buttonPressed]}
        onPress={() => router.push(APP_ROUTES.CAREGIVER.REMINDERS)}
        testID="home-checkup-card"
      >
        <View style={styles.controlCardRow}>
          <Ionicons name="calendar-outline" size={40} color={PALETTE.text.light} />
          <View style={styles.controlContent}>
            <Text style={styles.controlTitle}>{reminderTitle}</Text>
            <Text style={styles.controlDate}>
              {t('common:time.dateAtTime', {
                date: formatLongDate(scheduledDate),
                time: formatTime(scheduledDate),
              })}
            </Text>
            <View style={styles.controlSeeMore}>
              <Text style={styles.controlSeeMoreText}>{t('home.checkupDetails')}</Text>
              <Ionicons name="arrow-forward" size={13} color={PALETTE.text.light} />
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-home-screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header superior: Logo a la izquierda y Campana de notificaciones a la derecha */}
        <View style={styles.topHeader}>
          <Image
            source={APP_ASSETS.LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={t('common:brand.logoLabel')}
          />
          <Pressable
            style={({ pressed }) => [styles.notificationButton, pressed && styles.buttonPressed]}
            onPress={() => router.push(APP_ROUTES.CAREGIVER.NOTIFICATIONS)}
            accessibilityRole="button"
            accessibilityLabel={t('home.notifications')}
            testID="caregiver-notifications-bell"
          >
            <View style={styles.bellIconWrapper}>
              <Ionicons name="notifications" size={22} color={PALETTE.secondary} />
              {unreadCount > 0 ? <View style={styles.bellDot} testID="home-bell-dot" /> : null}
            </View>
          </Pressable>
        </View>

        {/* Saludo personalizado con el nombre del cuidador */}
        <Text style={styles.greetingTitle}>{greetingText}</Text>

        <OfflineDataNotice
          fromCache={fromCache}
          stale={stale}
          lastSyncedAt={lastSyncedAt}
          testID="home-offline-notice"
          style={styles.offlineNotice}
        />

        {/* Estado de carga de niños */}
        {status === 'loading' ? (
          <Card style={styles.loadingCard} testID="caregiver-children-loading">
            <ActivityIndicator size="small" color={PALETTE.primary} />
            <Text style={styles.loadingText}>{t('home.loading')}</Text>
          </Card>
        ) : null}

        {/* Estado de error de niños (sin datos ni conexión vs error real) */}
        {status === 'error' && loadError === 'needs-connection' ? (
          <Card style={styles.offlineEmptyCard} testID="caregiver-children-needs-connection">
            <Ionicons name="cloud-offline-outline" size={28} color={PALETTE.primary} />
            <Text style={styles.offlineEmptyText}>{t('common:offline.noDataMessage')}</Text>
            <Pressable
              style={({ pressed }) => [styles.offlineRetryButton, pressed && styles.buttonPressed]}
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel={t('home.retryA11y')}
            >
              <Text style={styles.retryButtonText}>{t('home.retry')}</Text>
            </Pressable>
          </Card>
        ) : null}

        {status === 'error' && loadError !== 'needs-connection' ? (
          <Card style={styles.errorCard} testID="caregiver-children-error">
            <Ionicons name="alert-circle-outline" size={24} color={PALETTE.feedback.error} />
            <Text style={styles.errorText}>{error || t('home.loadError')}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel={t('home.retryA11y')}
            >
              <Text style={styles.retryButtonText}>{t('home.retry')}</Text>
            </Pressable>
          </Card>
        ) : null}

        {/* Estado vacío cuando no hay niños registrados */}
        {status === 'empty' || (status === 'ready' && children.length === 0) ? (
          <Card style={styles.emptyCard} testID="caregiver-empty-children">
            <View style={styles.emptyIconWrapper}>
              <Ionicons name="people-outline" size={36} color={PALETTE.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('home.emptySubtitle')}</Text>
            <PrimaryButton
              label={t('home.addChild')}
              onPress={handleRegisterChild}
              testID="empty-add-child-button"
              accessibilityLabel={t('home.addChild')}
            />
          </Card>
        ) : null}

        {/* Tarjeta del niño activo (y acceso a «Mis niños» cuando hay varios) */}
        {activeChild ? (
          <View style={styles.activeChildSection}>
            {/* Acceso permanente a «Mis niños»: ver todos, agregar otro niño, vincular profesionales */}
            <Pressable
              style={({ pressed }) => [styles.myChildrenLinkRow, pressed && styles.buttonPressed]}
              onPress={() => router.push(APP_ROUTES.CAREGIVER.MY_CHILDREN)}
              accessibilityRole="button"
              accessibilityLabel={t('home.myChildrenA11y')}
              testID="home-my-children-link"
            >
              <Ionicons name="people-outline" size={16} color={PALETTE.primary} />
              <Text style={styles.sectionLink}>{t('home.myChildrenLink')}</Text>
              <Ionicons name="chevron-forward" size={15} color={PALETTE.primary} />
            </Pressable>

            <CaregiverChildCard
              child={activeChild}
              testID={`child-card-${activeChild.id}`}
              onPress={() =>
                router.push({
                  pathname: APP_ROUTES.CAREGIVER.EVOLUTION as never,
                  params: { childId: activeChild.id },
                })
              }
              professionals={professionals[activeChild.id]}
              onLinkProfessional={() =>
                router.push({
                  pathname: APP_ROUTES.CAREGIVER.LINK_PROFESSIONAL as never,
                  params: { childId: activeChild.id },
                })
              }
              onOpenProfessionals={() =>
                router.push({
                  pathname: APP_ROUTES.CAREGIVER.CHILD_PROFESSIONALS as never,
                  params: { childId: activeChild.id },
                })
              }
            />
          </View>
        ) : null}

        {/* Solo hay mensajes que mostrar si hay un niño registrado */}
        {activeChild ? (
          <>
            {/* Sección: Para ti */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.forYou')}</Text>
              <Pressable onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}>
                <Text style={styles.sectionLink}>{t('home.seeAll')}</Text>
              </Pressable>
            </View>

            {renderForYouCard()}
          </>
        ) : null}

        {/* Acceso a Alimentación en fila propia del Home */}
        <Pressable
          style={({ pressed }) => [styles.sectionCardPressable, pressed && styles.buttonPressed]}
          onPress={() =>
            router.push({
              pathname: APP_ROUTES.CAREGIVER.FEEDING as never,
              params: activeChild ? { childId: activeChild.id } : {},
            })
          }
          accessibilityRole="button"
          accessibilityLabel={
            activeChild
              ? t('home.registerFeedingA11y', { name: activeChild.firstName })
              : t('home.registerFeeding')
          }
          testID="child-feeding-button"
        >
          <Card style={styles.feedingCard}>
            <View style={styles.feedingRow}>
              <View style={styles.feedingIconCircle}>
                <Ionicons name="restaurant-outline" size={20} color={PALETTE.primary} />
              </View>
              <Text style={styles.feedingText}>{t('home.registerFeeding')}</Text>
              <Ionicons name="chevron-forward" size={18} color={PALETTE.text.muted} />
            </View>
          </Card>
        </Pressable>

        {/* Solo hay controles y mensajes que mostrar si hay un niño registrado */}
        {activeChild ? (
          <>
            {/* Sección: Próximo control */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.nextCheckup')}</Text>
              <Pressable onPress={() => router.push(APP_ROUTES.CAREGIVER.REMINDERS)}>
                <Text style={styles.sectionLink}>{t('home.schedule')}</Text>
              </Pressable>
            </View>

            {renderNextCheckupCard()}
          </>
        ) : null}

        {/* Sección: Aprende en casa (artículos según la edad del niño activo) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.learnAtHome')}</Text>
          <Pressable
            onPress={() => router.push(APP_ROUTES.CAREGIVER.LEARN)}
            accessibilityRole="button"
            testID="home-learn-see-all"
          >
            <Text style={styles.sectionLink}>{t('home.seeAll')}</Text>
          </Pressable>
        </View>

        {learnArticles.length > 0 ? (
          <View style={styles.cardsRow} testID="home-learn-cards">
            {learnArticles.map((article) => (
              <Pressable
                key={article.id}
                style={({ pressed }) => [styles.articlePressable, pressed && styles.buttonPressed]}
                onPress={() =>
                  router.push({
                    pathname: APP_ROUTES.CAREGIVER.LEARN_ARTICLE as never,
                    params: { id: article.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('home.articleA11y', { title: article.title })}
                testID={`home-learn-card-${article.id}`}
              >
                <Card style={styles.articleCard}>
                  <Text style={styles.articleTitle} numberOfLines={4}>
                    {article.title}
                  </Text>
                  <View style={styles.articleFooter}>
                    <Text style={styles.articleMeta}>
                      {t('learn.readTime', { count: readingMinutes(article.body) })}
                    </Text>
                    <Ionicons
                      name="book-outline"
                      size={32}
                      color={PALETTE.secondary}
                      style={styles.articleIcon}
                    />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : (
          <Card style={styles.discreteCard} testID="home-learn-empty">
            <Text style={styles.discreteText}>
              {education.status === 'needs-connection'
                ? t('home.learnConnect')
                : education.status === 'idle' || education.status === 'loading'
                  ? t('home.learnLoading')
                  : t('home.learnEmpty')}
            </Text>
          </Card>
        )}
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 170,
    height: 48,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  bellIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: PALETTE.secondary,
    borderWidth: 1.5,
    borderColor: PALETTE.surface,
  },
  greetingTitle: {
    fontFamily: font('semibold'),
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  offlineNotice: {
    marginBottom: 16,
  },
  offlineEmptyCard: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 24,
    gap: 10,
  },
  offlineEmptyText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 18,
  },
  offlineRetryButton: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    marginBottom: 24,
    gap: 10,
  },
  loadingText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  errorCard: {
    backgroundColor: PALETTE.feedback.errorBg,
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: PALETTE.feedback.error,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  retryButtonText: {
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 24,
  },
  emptyIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: font('semibold'),
    fontSize: 17,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  activeChildSection: {
    marginBottom: 24,
    gap: 8,
  },
  myChildrenLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: font('medium'),
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  sectionLink: {
    fontFamily: font('semibold'),
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  sectionCardPressable: {
    marginBottom: 20,
  },
  discreteCard: {
    marginBottom: 20,
  },
  discreteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  discreteErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  discreteText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  discreteErrorText: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
  messageCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  messageIcon: {
    marginLeft: 4,
  },
  messageContent: {
    flex: 1,
    gap: 4,
  },
  messageTitle: {
    fontFamily: font('semibold'),
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  messageQuote: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    fontStyle: 'italic',
  },
  messageMeta: {
    fontFamily: font('regular'),
    fontSize: 11,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  feedingCard: {
    paddingVertical: 14,
  },
  feedingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feedingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedingText: {
    flex: 1,
    fontFamily: font('medium'),
    fontSize: 15,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  controlCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: RADIUS_PILL,
    padding: 16,
    marginBottom: 24,
    ...CARD_SHADOW,
  },
  controlCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  controlContent: {
    flex: 1,
    gap: 3,
  },
  controlTitle: {
    fontFamily: font('semibold'),
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '600',
  },
  controlDate: {
    fontFamily: font('medium'),
    color: PALETTE.text.light,
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.95,
  },
  controlSeeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  controlSeeMoreText: {
    fontFamily: font('medium'),
    color: PALETTE.text.light,
    fontSize: 11,
    fontWeight: '500',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  articlePressable: {
    flex: 1,
  },
  articleCard: {
    flex: 1,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  articleTitle: {
    fontFamily: font('semibold'),
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.title,
    lineHeight: 20,
  },
  articleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  articleMeta: {
    fontFamily: font('regular'),
    fontSize: 11,
    color: PALETTE.text.muted,
    lineHeight: 15,
  },
  articleIcon: {
    marginBottom: -2,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
