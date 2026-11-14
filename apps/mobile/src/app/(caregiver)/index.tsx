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
import { ChildGrowthStatus } from '../../components/ChildGrowthStatus.js';
import { APP_ASSETS } from '../../constants/assets.js';
import { PALETTE } from '../../constants/colors.js';
import { DEMO_HOME_MESSAGE, DEMO_NEXT_CHECKUP } from '../../constants/demo-data.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../context/auth-context.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useEducation } from '../../hooks/useEducation.js';
import { formatLongDate } from '../../i18n/format.js';
import { formatChildAge } from '../../lib/children-api.js';
import { childAgeMonths, filterByAge, readingMinutes } from '../../lib/education.js';

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const { user } = useAuth();
  const { status, children, error, load } = useChildren();
  const education = useEducation();
  const loadEducation = education.load;

  // Refresh the children list when the tab gets focus
  useFocusEffect(
    useCallback(() => {
      void load();
      void loadEducation();
    }, [load, loadEducation]),
  );

  // The two articles shown on Home: those for the first child's age, or the first of the catalog.
  const firstChild = children[0];
  const learnArticles = (() => {
    if (!firstChild) return education.articles.slice(0, 2);
    const forAge = filterByAge(education.articles, childAgeMonths(firstChild));
    return (forAge.length > 0 ? forAge : education.articles).slice(0, 2);
  })();

  const caregiverName = user?.firstName || t('home.greetingFallback');
  const greetingText = t('home.greeting', { name: caregiverName });

  const handleRegisterChild = () => {
    // Show the consent screen (register mode) before registering the child (NK-20)
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { mode: 'register' },
    });
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
            onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}
            accessibilityRole="button"
            accessibilityLabel={t('home.notifications')}
            testID="caregiver-notifications-bell"
          >
            <Ionicons name="notifications" size={22} color={PALETTE.secondary} />
          </Pressable>
        </View>

        {/* Saludo personalizado con el nombre del cuidador */}
        <Text style={styles.greetingTitle}>{greetingText}</Text>

        {/* Estado de carga */}
        {status === 'loading' && (
          <View style={styles.loadingContainer} testID="caregiver-children-loading">
            <ActivityIndicator size="small" color={PALETTE.primary} />
            <Text style={styles.loadingText}>{t('home.loading')}</Text>
          </View>
        )}

        {/* Estado de error */}
        {status === 'error' && (
          <View style={styles.errorContainer} testID="caregiver-children-error">
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
          </View>
        )}

        {/* Estado vacío cuando no hay niños registrados */}
        {(status === 'empty' || (status === 'ready' && children.length === 0)) && (
          <View style={styles.emptyContainer} testID="caregiver-empty-children">
            <View style={styles.emptyIconWrapper}>
              <Ionicons name="people-outline" size={38} color={PALETTE.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('home.emptySubtitle')}</Text>
            <Pressable
              style={({ pressed }) => [styles.emptyAddButton, pressed && styles.buttonPressed]}
              onPress={handleRegisterChild}
              testID="empty-add-child-button"
              accessibilityRole="button"
              accessibilityLabel={t('home.addChild')}
            >
              <Ionicons name="add" size={18} color={PALETTE.text.light} />
              <Text style={styles.emptyAddButtonText}>{t('home.addChild')}</Text>
            </Pressable>
          </View>
        )}

        {/* Lista de tarjetas de niños cuando existen registros */}
        {children.length > 0 && (
          <View style={styles.childrenListContainer} testID="caregiver-children-list">
            {children.map((child) => {
              const childAge = formatChildAge(child.birthDate);
              const isGirl = child.sex === 'FEMALE';

              return (
                <View key={child.id} style={styles.childCard} testID={`child-card-${child.id}`}>
                  <View style={styles.childIconWrapper}>
                    <Ionicons
                      name={isGirl ? 'woman' : 'body'}
                      size={50}
                      color={PALETTE.text.light}
                    />
                  </View>

                  <View style={styles.childInfoWrapper}>
                    <Text style={styles.childNameTitle}>
                      {t('home.childSummary', {
                        name: `${child.firstName} ${child.lastName}`,
                        age: childAge,
                      })}
                    </Text>
                    <Text style={styles.childSubtitle}>{t('home.childSubtitle')}</Text>

                    {/* Status is shown with short text, icon and color (never color alone); no z-scores or technical classifications */}
                    <ChildGrowthStatus childId={child.id} childName={child.firstName} />

                    <Pressable
                      style={({ pressed }) => [styles.seeMoreRow, pressed && styles.buttonPressed]}
                      onPress={() =>
                        router.push({
                          pathname: APP_ROUTES.CAREGIVER.EVOLUTION as never,
                          params: { childId: child.id },
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={t('home.seeMoreA11y', { name: child.firstName })}
                    >
                      <Text style={styles.seeMoreText}>{t('home.seeMore')}</Text>
                      <Ionicons name="arrow-forward" size={14} color={PALETTE.text.light} />
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {/* Dashed "add child" card (Figma design) */}
            <Pressable
              style={({ pressed }) => [styles.dashedAddCard, pressed && styles.buttonPressed]}
              onPress={handleRegisterChild}
              testID="add-child-dashed-card"
              accessibilityRole="button"
              accessibilityLabel={t('home.addChild')}
            >
              <View style={styles.dashedAddIconCircle}>
                <Ionicons name="add" size={22} color={PALETTE.primary} />
              </View>
              <Text style={styles.dashedAddText}>{t('home.addChild')}</Text>
            </Pressable>

            {/* Privacy notice (Figma design) */}
            <Text style={styles.linkedChildrenNotice}>{t('home.linkedNotice')}</Text>
          </View>
        )}

        {/* Sección: Para ti */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.forYou')}</Text>
          <Pressable onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}>
            <Text style={styles.sectionLink}>{t('home.seeAll')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.whiteCard, pressed && styles.buttonPressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.MESSAGES)}
        >
          <View style={styles.messageCardRow}>
            <Ionicons
              name="chatbubble-ellipses"
              size={36}
              color={PALETTE.secondary}
              style={styles.messageIcon}
            />
            <View style={styles.messageContent}>
              <Text style={styles.messageTitle}>{t('home.messageTitle')}</Text>
              <Text style={styles.messageQuote}>
                {t('home.messageQuote', { text: DEMO_HOME_MESSAGE.content })}
              </Text>
              <Text style={styles.messageMeta}>
                {t('home.messageMeta', {
                  when: t('common:time.daysAgo', { count: DEMO_HOME_MESSAGE.daysAgo }),
                  author: DEMO_HOME_MESSAGE.authorName,
                })}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Sección: Próximo control */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.nextCheckup')}</Text>
          <Pressable onPress={() => router.push(APP_ROUTES.CAREGIVER.REMINDERS)}>
            <Text style={styles.sectionLink}>{t('home.schedule')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.controlCard, pressed && styles.buttonPressed]}
          onPress={() => router.push(APP_ROUTES.CAREGIVER.REMINDERS)}
        >
          <View style={styles.controlCardRow}>
            <Ionicons name="calendar-outline" size={40} color={PALETTE.text.light} />
            <View style={styles.controlContent}>
              <Text style={styles.controlTitle}>{t('home.checkupTitle')}</Text>
              <Text style={styles.controlDate}>
                {t('home.checkupDate', { date: formatLongDate(DEMO_NEXT_CHECKUP.date) })}
              </Text>
              <Text style={styles.controlLocation}>
                {t('home.checkupPlace', {
                  place: DEMO_NEXT_CHECKUP.place,
                  time: DEMO_NEXT_CHECKUP.time,
                })}
              </Text>
              <View style={styles.controlSeeMore}>
                <Text style={styles.controlSeeMoreText}>{t('home.checkupDetails')}</Text>
                <Ionicons name="arrow-forward" size={13} color={PALETTE.text.light} />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Sección: Aprende en casa (artículos según la edad del primer niño) */}
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
                style={({ pressed }) => [styles.articleCard, pressed && styles.buttonPressed]}
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
                <Text style={styles.articleTitle} numberOfLines={4}>
                  {article.title}
                </Text>
                <View style={styles.articleFooter}>
                  <Text style={styles.articleMeta}>
                    {t('learn.readTime', { count: readingMinutes(article.body) })}
                  </Text>
                  <Ionicons
                    name="book-outline"
                    size={34}
                    color={PALETTE.secondary}
                    style={styles.articleIcon}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.whiteCard} testID="home-learn-empty">
            <Text style={styles.messageQuote}>
              {education.status === 'needs-connection'
                ? t('home.learnConnect')
                : education.status === 'idle' || education.status === 'loading'
                  ? t('home.learnLoading')
                  : t('home.learnEmpty')}
            </Text>
          </View>
        )}

        {/* Sección: Registro de nuevo niño con consentimiento informado */}
        <View style={styles.actionSection}>
          <Pressable
            style={({ pressed }) => [styles.registerButton, pressed && styles.buttonPressed]}
            onPress={handleRegisterChild}
            testID="start-child-registration-button"
            accessibilityRole="button"
            accessibilityLabel={t('home.registerChildA11y')}
          >
            <Text style={styles.registerButtonText}>{t('home.registerChild')}</Text>
          </Pressable>
          <Text style={styles.consentNotice}>{t('home.consentNotice')}</Text>
        </View>
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
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  loadingContainer: {
    backgroundColor: PALETTE.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  errorContainer: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
    gap: 8,
  },
  errorText: {
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
    color: PALETTE.text.light,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    backgroundColor: PALETTE.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyAddButtonText: {
    color: PALETTE.text.light,
    fontSize: 14,
    fontWeight: '700',
  },
  childrenListContainer: {
    marginBottom: 12,
  },
  childCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  childIconWrapper: {
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childInfoWrapper: {
    flex: 1,
  },
  childNameTitle: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '800',
  },
  childSubtitle: {
    color: PALETTE.text.light,
    fontSize: 12,
    opacity: 0.9,
    marginTop: 2,
    marginBottom: 8,
  },
  seeMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  seeMoreText: {
    color: PALETTE.text.light,
    fontSize: 12,
    fontWeight: '600',
  },
  dashedAddCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: PALETTE.border.default,
    borderStyle: 'dashed',
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  dashedAddIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedAddText: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  linkedChildrenNotice: {
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.text.title,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  whiteCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  messageQuote: {
    fontSize: 13,
    color: PALETTE.text.body,
    fontStyle: 'italic',
  },
  messageMeta: {
    fontSize: 11,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  controlCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
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
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '800',
  },
  controlDate: {
    color: PALETTE.text.light,
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.95,
  },
  controlLocation: {
    color: PALETTE.text.light,
    fontSize: 12,
    opacity: 0.9,
  },
  controlSeeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  controlSeeMoreText: {
    color: PALETTE.text.light,
    fontSize: 11,
    fontWeight: '600',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  articleCard: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    minHeight: 140,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  articleTitle: {
    fontSize: 15,
    fontWeight: '800',
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
    fontSize: 11,
    color: PALETTE.text.muted,
    lineHeight: 15,
  },
  articleIcon: {
    marginBottom: -2,
  },
  actionSection: {
    marginTop: 24,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border.default,
    paddingTop: 18,
  },
  registerButton: {
    backgroundColor: PALETTE.primary,
    paddingVertical: 15,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  registerButtonText: {
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '700',
  },
  consentNotice: {
    fontSize: 12,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 17,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
