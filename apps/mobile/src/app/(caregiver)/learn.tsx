import { Ionicons } from '@expo/vector-icons';
import type { EducationalContentResponse } from '@nutrikids/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useEducation } from '../../hooks/useEducation.js';
import { formatAge } from '../../i18n/format.js';
import {
  articlePreview,
  childAgeMonths,
  filterByAge,
  readingMinutes,
} from '../../lib/education.js';

/** Filter value that shows every article, whatever the age. */
const ALL_AGES = 'all';

export default function LearnScreen() {
  const { t, i18n } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { children, load: loadChildren } = useChildren();
  const { status, articles, offline, contentLanguage, error, load } = useEducation();
  /** Child whose age filters the list, `all` for no filter, `null` for the first child. */
  const [filter, setFilter] = useState<string | null>(params.childId ?? null);

  // The tabs keep their screens mounted, so the data is read again each time this one is shown.
  useFocusEffect(
    useCallback(() => {
      void loadChildren();
      void load();
    }, [loadChildren, load]),
  );

  const child =
    filter === ALL_AGES
      ? null
      : (children.find((item) => item.id === filter) ?? children[0] ?? null);
  const ageMonths = child ? childAgeMonths(child) : null;
  const visible = ageMonths === null ? articles : filterByAge(articles, ageMonths);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
    }
  };

  const openArticle = (article: EducationalContentResponse) =>
    router.push({
      pathname: APP_ROUTES.CAREGIVER.LEARN_ARTICLE as never,
      params: { id: article.id },
    });

  const header = (
    <>
      <Pressable
        style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel={t('learn.back')}
        testID="learn-back"
      >
        <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        <Text style={styles.backText}>{t('learn.back')}</Text>
      </Pressable>
      <Text style={styles.screenTitle}>{t('learn.title')}</Text>
    </>
  );

  const renderState = (content: React.ReactNode, testID: string) => (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.scrollContent}>
        {header}
        <View style={styles.stateBox} testID={testID}>
          {content}
        </View>
      </View>
    </SafeAreaView>
  );

  const retryButton = (
    <Pressable
      style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
      onPress={() => void load()}
      accessibilityRole="button"
      accessibilityLabel={t('learn.retry')}
      testID="learn-retry"
    >
      <Text style={styles.stateButtonText}>{t('learn.retry')}</Text>
    </Pressable>
  );

  if (status === 'idle' || status === 'loading') {
    return renderState(
      <>
        <ActivityIndicator color={PALETTE.primary} />
        <Text style={styles.stateText}>{t('learn.loading')}</Text>
      </>,
      'learn-loading',
    );
  }

  if (status === 'needs-connection') {
    return renderState(
      <>
        <Ionicons name="cloud-download-outline" size={40} color={PALETTE.primary} />
        <Text style={styles.stateTitle}>{t('learn.needsConnectionTitle')}</Text>
        <Text style={styles.stateText}>{t('learn.needsConnectionSubtitle')}</Text>
        {retryButton}
      </>,
      'learn-needs-connection',
    );
  }

  if (status === 'error') {
    return renderState(
      <>
        <Text style={styles.stateText}>{error ?? t('learn.loadError')}</Text>
        {retryButton}
      </>,
      'learn-error',
    );
  }

  if (status === 'empty') {
    return renderState(
      <>
        <Text style={styles.stateTitle}>{t('learn.emptyCatalogTitle')}</Text>
        <Text style={styles.stateText}>{t('learn.emptyCatalogSubtitle')}</Text>
      </>,
      'learn-empty-catalog',
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-learn-screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {header}

        {/* Banner naranja: de qué niño son los artículos */}
        {child && ageMonths !== null ? (
          <ChildBanner
            style={styles.childBanner}
            name={`${child.firstName} ${child.lastName}`}
            subtitle={t('learn.bannerSubtitle', { age: formatAge(ageMonths) })}
          />
        ) : null}

        {/* Filtro por la edad del niño (solo si hay más de uno) */}
        {children.length > 1 ? (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('learn.filterLabel')}</Text>
            <View style={styles.chipRow}>
              {children.map((item) => {
                const selected = child?.id === item.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.chip, selected && styles.chipSelectedChild]}
                    onPress={() => setFilter(item.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    testID={`learn-filter-${item.id}`}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {item.firstName}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.chip, !child && styles.chipSelected]}
                onPress={() => setFilter(ALL_AGES)}
                accessibilityRole="button"
                accessibilityState={{ selected: !child }}
                testID="learn-filter-all"
              >
                <Text style={[styles.chipText, !child && styles.chipTextSelected]}>
                  {t('learn.filterAll')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {offline ? (
          <View style={styles.notice} testID="learn-offline-notice">
            <Ionicons name="cloud-offline-outline" size={18} color={PALETTE.feedback.warning} />
            <Text style={styles.noticeText}>{t('learn.offlineNotice')}</Text>
          </View>
        ) : null}

        {contentLanguage && contentLanguage !== i18n.language ? (
          <View style={styles.notice} testID="learn-language-notice">
            <Ionicons name="language-outline" size={18} color={PALETTE.feedback.warning} />
            <Text style={styles.noticeText}>{t('learn.languageFallback')}</Text>
          </View>
        ) : null}

        {visible.length === 0 ? (
          <View style={styles.stateBox} testID="learn-empty-age">
            <Text style={styles.stateTitle}>
              {t('learn.emptyForAgeTitle', { age: ageMonths === null ? '' : formatAge(ageMonths) })}
            </Text>
            <Text style={styles.stateText}>{t('learn.emptyForAgeSubtitle')}</Text>
            <Pressable
              style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
              onPress={() => setFilter(ALL_AGES)}
              accessibilityRole="button"
              accessibilityLabel={t('learn.showAll')}
              testID="learn-show-all"
            >
              <Text style={styles.stateButtonText}>{t('learn.showAll')}</Text>
            </Pressable>
          </View>
        ) : (
          visible.map((article) => (
            <Pressable
              key={article.id}
              style={({ pressed }) => [styles.articleCard, pressed && styles.pressed]}
              onPress={() => openArticle(article)}
              accessibilityRole="button"
              accessibilityLabel={t('learn.readA11y', { title: article.title })}
              testID={`learn-article-${article.id}`}
            >
              <View style={styles.articleHeader}>
                <Text style={styles.articleTitle}>{article.title}</Text>
                <Ionicons name="chevron-forward" size={20} color={PALETTE.text.muted} />
              </View>
              <Text style={styles.articlePreview}>{articlePreview(article.body)}</Text>
              <Text style={styles.articleMeta}>
                {t('learn.ageRange', { min: article.minAgeMonths, max: article.maxAgeMonths })}
                {' · '}
                {t('learn.readTime', { count: readingMinutes(article.body) })}
              </Text>
            </Pressable>
          ))
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  childBanner: {
    marginBottom: 16,
  },
  filterGroup: {
    marginBottom: 16,
    gap: 8,
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: '#F7F7F7',
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  chipSelected: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  chipSelectedChild: {
    backgroundColor: PALETTE.secondary,
    borderColor: PALETTE.secondary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  chipTextSelected: {
    color: PALETTE.text.light,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.feedback.warningBg,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: PALETTE.text.body,
  },
  articleCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    padding: 16,
    marginBottom: 12,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  articleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  articleTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: PALETTE.text.title,
    lineHeight: 21,
  },
  articlePreview: {
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 19,
  },
  articleMeta: {
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  stateButtonText: {
    color: PALETTE.text.light,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
