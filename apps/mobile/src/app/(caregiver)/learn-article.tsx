import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useEducation } from '../../hooks/useEducation.js';
import { readingMinutes, splitParagraphs } from '../../lib/education.js';

export default function LearnArticleScreen() {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { status, articles, error, load } = useEducation();

  // The catalog comes from the copy saved on the phone first, so the article opens offline.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const article = articles.find((item) => item.id === params.id) ?? null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.LEARN);
    }
  };

  const backRow = (
    <Pressable
      style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
      onPress={handleBack}
      accessibilityRole="button"
      accessibilityLabel={t('learn.back')}
      testID="learn-article-back"
    >
      <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
      <Text style={styles.backText}>{t('learn.back')}</Text>
    </Pressable>
  );

  if (!article) {
    const loading = status === 'idle' || status === 'loading';
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          {backRow}
          {loading ? (
            <View style={styles.stateBox} testID="learn-article-loading">
              <ActivityIndicator color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('learn.loading')}</Text>
            </View>
          ) : status === 'error' || status === 'needs-connection' ? (
            <View style={styles.stateBox} testID="learn-article-error">
              <Text style={styles.stateText}>
                {status === 'needs-connection'
                  ? t('learn.needsConnectionTitle')
                  : (error ?? t('learn.loadError'))}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() => void load()}
                accessibilityRole="button"
                accessibilityLabel={t('learn.retry')}
                testID="learn-article-retry"
              >
                <Text style={styles.stateButtonText}>{t('learn.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stateBox} testID="learn-article-not-found">
              <Text style={styles.stateTitle}>{t('learn.article.notFoundTitle')}</Text>
              <Text style={styles.stateText}>{t('learn.article.notFoundSubtitle')}</Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() => router.replace(APP_ROUTES.CAREGIVER.LEARN)}
                accessibilityRole="button"
                accessibilityLabel={t('learn.article.backToList')}
                testID="learn-article-to-list"
              >
                <Text style={styles.stateButtonText}>{t('learn.article.backToList')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
      testID="caregiver-learn-article-screen"
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {backRow}

        <View style={styles.metaRow}>
          <View style={styles.agePill}>
            <Text style={styles.agePillText}>
              {t('learn.ageRange', { min: article.minAgeMonths, max: article.maxAgeMonths })}
            </Text>
          </View>
          <Text style={styles.readTime}>
            {t('learn.readTime', { count: readingMinutes(article.body) })}
          </Text>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {article.title}
        </Text>

        {splitParagraphs(article.body).map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginBottom: 16,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  agePill: {
    backgroundColor: PALETTE.secondaryLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  agePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.secondaryPressed,
  },
  readTime: {
    fontSize: 12,
    color: PALETTE.text.muted,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: PALETTE.text.title,
    lineHeight: 33,
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 17,
    color: PALETTE.text.body,
    lineHeight: 27,
    marginBottom: 14,
  },
  stateBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
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
