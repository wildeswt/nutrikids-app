import { Ionicons } from '@expo/vector-icons';
import { FEEDING_DETAILS_MAX, MEALS_PER_DAY_MAX, MEALS_PER_DAY_MIN } from '@nutrikids/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { PALETTE } from '../../constants/colors.js';
import {
  BUTTON_HEIGHT,
  BUTTON_WIDTH,
  FIELD_HEIGHT,
  RADIUS_PILL,
  SCREEN_MARGIN,
} from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useChildren } from '../../hooks/useChildren.js';
import { useFeedingLog } from '../../hooks/useFeedingLog.js';
import { formatLongDate } from '../../i18n/format.js';
import { isConsentRequiredError, isFeedingNetworkError } from '../../lib/feeding-api.js';
import {
  MEAL_OPTIONS,
  buildCreateFeedingLogInput,
  buildFeedingDetails,
  stepMealsPerDay,
  toggleMealSelection,
  type MealId,
  type MealOption,
} from '../../lib/feeding-form.js';
import { generateUuid } from '../../lib/uuid.js';

const MEAL_ROWS: readonly (readonly [MealOption, MealOption | null])[] = [
  [MEAL_OPTIONS[0]!, MEAL_OPTIONS[1]!],
  [MEAL_OPTIONS[2]!, MEAL_OPTIONS[3]!],
  [MEAL_OPTIONS[4]!, null],
];

const SAVE_REDIRECT_DELAY_MS = 800;

export default function FeedingScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'errors']);
  const params = useLocalSearchParams<{ childId?: string }>();

  const {
    status: childrenStatus,
    children,
    error: childrenError,
    load: loadChildren,
  } = useChildren();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(params.childId ?? null);
  const activeChild = children.find((child) => child.id === selectedChildId) ?? children[0] ?? null;
  const { create, saving } = useFeedingLog(activeChild?.id ?? null);

  const [selectedMeals, setSelectedMeals] = useState<MealId[]>([]);
  const [mealsPerDay, setMealsPerDay] = useState<number>(MEALS_PER_DAY_MIN);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);
  const [savedMode, setSavedMode] = useState<'none' | 'online' | 'offline'>('none');
  const savedSuccess = savedMode !== 'none';

  /** Mismo UUID en reintentos del mismo contenido para evitar duplicados en la API. */
  const attemptId = useRef<string | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) {
        clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  const resetAttempt = () => {
    attemptId.current = null;
    setErrorMessage(null);
    setConsentRequired(false);
    setSavedMode('none');
  };

  const handleBack = useCallback(() => {
    if (redirectTimer.current !== null) {
      clearTimeout(redirectTimer.current);
      redirectTimer.current = null;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
    }
  }, [router]);

  const handleSwitchChild = () => {
    if (!activeChild || children.length < 2) return;
    const index = children.findIndex((child) => child.id === activeChild.id);
    setSelectedChildId(children[(index + 1) % children.length]!.id);
    resetAttempt();
  };

  const handleGoToConsent = () => {
    if (!activeChild) return;
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { childId: activeChild.id, childName: activeChild.firstName, mode: 'view' },
    });
  };

  const handleToggleMeal = (mealId: MealId) => {
    if (saving || savedSuccess) return;
    const next = toggleMealSelection(selectedMeals, mealId);
    setSelectedMeals(next.selectedMeals);
    setMealsPerDay(next.mealsPerDay);
    resetAttempt();
  };

  const handleStepMeals = (delta: -1 | 1) => {
    if (saving || savedSuccess) return;
    setMealsPerDay((prev) => stepMealsPerDay(prev, delta));
    resetAttempt();
  };

  const handleChangeNotes = (value: string) => {
    setNotes(value);
    resetAttempt();
  };

  const handleSave = async () => {
    if (!activeChild || saving || savedSuccess) return;
    setErrorMessage(null);
    setConsentRequired(false);

    attemptId.current ??= generateUuid();
    const result = buildCreateFeedingLogInput(
      { selectedMeals, mealsPerDay, freeText: notes },
      { id: attemptId.current },
    );

    if (!result.ok) {
      setErrorMessage(t('feeding.errors.invalid'));
      return;
    }

    try {
      const created = await create(result.input);
      attemptId.current = null;
      setSavedMode(created?.savedLocally ? 'offline' : 'online');
      redirectTimer.current = setTimeout(() => {
        handleBack();
      }, SAVE_REDIRECT_DELAY_MS);
    } catch (err) {
      if (isFeedingNetworkError(err)) {
        setErrorMessage(t('errors:feeding.network'));
      } else if (isConsentRequiredError(err)) {
        setConsentRequired(true);
      } else {
        setErrorMessage(err instanceof Error ? err.message : t('errors:feeding.create'));
      }
    }
  };

  const detailsPreview = buildFeedingDetails(selectedMeals, notes);
  const canDecrease = mealsPerDay > MEALS_PER_DAY_MIN && !saving && !savedSuccess;
  const canIncrease = mealsPerDay < MEALS_PER_DAY_MAX && !saving && !savedSuccess;
  const isLoadingChildren = childrenStatus === 'idle' || childrenStatus === 'loading';

  const header = (
    <>
      <Pressable
        style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel={t('feeding.back')}
        testID="feeding-back-button"
      >
        <Ionicons name="arrow-back" size={24} color={PALETTE.text.title} />
        <Text style={styles.backText}>{t('feeding.back')}</Text>
      </Pressable>

      <Text style={styles.screenTitle}>{t('feeding.title')}</Text>
    </>
  );

  if (!activeChild) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.scrollContent}>
          {header}
          {isLoadingChildren ? (
            <View style={styles.stateBox} testID="feeding-loading">
              <ActivityIndicator color={PALETTE.primary} />
              <Text style={styles.stateText}>{t('feeding.loading')}</Text>
            </View>
          ) : childrenStatus === 'error' ? (
            <View style={styles.stateBox} testID="feeding-error">
              <Text style={styles.stateText}>{childrenError ?? t('feeding.loadError')}</Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() => void loadChildren()}
                accessibilityRole="button"
                accessibilityLabel={t('feeding.retry')}
                testID="feeding-retry"
              >
                <Text style={styles.stateButtonText}>{t('feeding.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stateBox} testID="feeding-empty">
              <Text style={styles.stateTitle}>{t('feeding.emptyTitle')}</Text>
              <Text style={styles.stateText}>{t('feeding.emptySubtitle')}</Text>
              <Pressable
                style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
                onPress={() =>
                  router.push({
                    pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
                    params: { mode: 'register' },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('feeding.addChild')}
                testID="feeding-add-child"
              >
                <Text style={styles.stateButtonText}>{t('feeding.addChild')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        {header}

        <ChildBanner
          name={`${activeChild.firstName} ${activeChild.lastName}`}
          subtitle={t('feeding.childSubtitle', { date: formatLongDate(new Date()) })}
          style={styles.childBanner}
        />

        <View style={styles.linksRow}>
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
            onPress={() =>
              router.push({
                pathname: APP_ROUTES.CAREGIVER.FEEDING_HISTORY as never,
                params: { childId: activeChild.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('feedingHistory.seeHistory')}
            testID="feeding-see-history"
          >
            <Text style={styles.changeChildText}>{t('feedingHistory.seeHistory')}</Text>
          </Pressable>
          {children.length > 1 ? (
            <Pressable
              style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
              onPress={handleSwitchChild}
              accessibilityRole="button"
              accessibilityLabel={t('feeding.changeChild')}
              testID="change-child-button"
            >
              <Text style={styles.changeChildText}>{t('feeding.changeChild')}</Text>
            </Pressable>
          ) : null}
        </View>

        {savedSuccess ? (
          <View
            style={styles.successBanner}
            accessibilityRole="alert"
            testID="feeding-success-banner"
          >
            <Text style={styles.successBannerText}>
              {savedMode === 'offline' ? t('feeding.savedOffline') : t('feeding.savedSuccess')}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBanner} accessibilityRole="alert" testID="feeding-error-banner">
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}

        {consentRequired ? (
          <View style={styles.errorBanner} accessibilityRole="alert" testID="consent-required">
            <Text style={styles.errorBannerText}>
              {t('feeding.consentRequired', { name: activeChild.firstName })}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.consentButton, pressed && styles.pressed]}
              onPress={handleGoToConsent}
              accessibilityRole="button"
              accessibilityLabel={t('feeding.goToConsent')}
              testID="go-to-consent-button"
            >
              <Text style={styles.consentButtonText}>{t('feeding.goToConsent')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Comidas de hoy */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('feeding.mealsTodayLabel')}</Text>
          <View style={styles.mealsGrid}>
            {MEAL_ROWS.map(([leftMeal, rightMeal]) => (
              <View key={leftMeal.id} style={styles.mealRow}>
                {[leftMeal, rightMeal].map((meal, colIdx) => {
                  if (!meal) {
                    return <View key={`spacer-${colIdx}`} style={styles.mealSpacer} />;
                  }
                  const checked = selectedMeals.includes(meal.id);
                  const label = t(`feeding.meals.${meal.id}`);
                  return (
                    <Pressable
                      key={meal.id}
                      style={({ pressed }) => [styles.mealCheckboxItem, pressed && styles.pressed]}
                      onPress={() => handleToggleMeal(meal.id)}
                      accessibilityRole="checkbox"
                      accessibilityLabel={label}
                      accessibilityState={{ checked }}
                      testID={`feeding-meal-${meal.id}`}
                    >
                      <View
                        style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}
                        testID={`feeding-meal-box-${meal.id}`}
                      >
                        {checked ? (
                          <Ionicons name="checkmark" size={14} color={PALETTE.text.light} />
                        ) : null}
                      </View>
                      <Text style={styles.mealLabel}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* ¿Cuántas veces comió? */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('feeding.mealsCountLabel')}</Text>
          <View style={styles.counterContainer} testID="feeding-meals-counter">
            <Pressable
              style={({ pressed }) => [
                styles.counterButton,
                !canDecrease && styles.counterButtonDisabled,
                pressed && canDecrease && styles.pressed,
              ]}
              onPress={() => handleStepMeals(-1)}
              disabled={!canDecrease}
              accessibilityRole="button"
              accessibilityLabel={t('feeding.decreaseMealsA11y')}
              accessibilityState={{ disabled: !canDecrease }}
              testID="feeding-meals-decrease"
            >
              <Ionicons name="remove" size={20} color={PALETTE.primary} />
            </Pressable>

            <Text style={styles.counterLabel} testID="feeding-meals-count">
              <Text style={styles.counterNumber}>{mealsPerDay}</Text>{' '}
              {t('feeding.mealUnit', { count: mealsPerDay })}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.counterButton,
                !canIncrease && styles.counterButtonDisabled,
                pressed && canIncrease && styles.pressed,
              ]}
              onPress={() => handleStepMeals(1)}
              disabled={!canIncrease}
              accessibilityRole="button"
              accessibilityLabel={t('feeding.increaseMealsA11y')}
              accessibilityState={{ disabled: !canIncrease }}
              testID="feeding-meals-increase"
            >
              <Ionicons name="add" size={20} color={PALETTE.primary} />
            </Pressable>
          </View>
        </View>

        {/* ¿Qué comió? */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('feeding.notesLabel')}</Text>
          <View style={styles.notesContainer}>
            <KeyboardAwareTextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={handleChangeNotes}
              placeholder={t('feeding.notesPlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              multiline
              maxLength={FEEDING_DETAILS_MAX}
              textAlignVertical="top"
              editable={!saving && !savedSuccess}
              accessibilityLabel={t('feeding.notesLabel')}
              testID="feeding-notes-input"
            />
          </View>
          {detailsPreview.truncated ? (
            <Text
              style={styles.truncationWarning}
              accessibilityRole="alert"
              testID="feeding-truncation-warning"
            >
              {t('feeding.detailsTruncatedWarning', { max: FEEDING_DETAILS_MAX })}
            </Text>
          ) : null}
        </View>

        {/* Botón principal: Guardar alimentación */}
        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            (saving || savedSuccess) && styles.submitButtonDisabled,
            pressed && !saving && !savedSuccess && styles.submitButtonPressed,
          ]}
          onPress={() => void handleSave()}
          disabled={saving || savedSuccess}
          accessibilityRole="button"
          accessibilityLabel={t('feeding.submit')}
          accessibilityState={{ busy: saving, disabled: saving || savedSuccess }}
          testID="submit-feeding-button"
        >
          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={PALETTE.text.light} />
              <Text style={styles.submitButtonText}>{t('feeding.saving')}</Text>
            </View>
          ) : (
            <Text style={styles.submitButtonText}>{t('feeding.submit')}</Text>
          )}
        </Pressable>
      </KeyboardAwareScrollView>
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
    paddingBottom: 36,
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
    fontFamily: font('medium'),
    fontSize: 20,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  screenTitle: {
    fontFamily: font('semibold'),
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
    marginBottom: 18,
  },
  childBanner: {
    width: '100%',
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  linkButton: {
    paddingVertical: 2,
  },
  changeChildText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.primary,
    textDecorationLine: 'underline',
  },
  successBanner: {
    backgroundColor: PALETTE.feedback.successBg,
    borderColor: PALETTE.feedback.success,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  successBannerText: {
    color: PALETTE.feedback.success,
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: PALETTE.feedback.error,
    fontSize: 13,
    fontWeight: '600',
  },
  consentButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: PALETTE.feedback.error,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  consentButtonText: {
    color: PALETTE.text.light,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontFamily: font('medium'),
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
    marginBottom: 12,
  },
  mealsGrid: {
    gap: 8,
  },
  mealRow: {
    flexDirection: 'row',
    gap: 16,
  },
  mealCheckboxItem: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealSpacer: {
    flex: 1,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: PALETTE.border.checkbox,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  mealLabel: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
  },
  counterContainer: {
    width: '100%',
    height: FIELD_HEIGHT,
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: PALETTE.border.checkbox,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3,
  },
  counterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PALETTE.background,
    borderWidth: 1,
    borderColor: PALETTE.border.checkbox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonDisabled: {
    opacity: 0.4,
  },
  counterLabel: {
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
  },
  counterNumber: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  notesContainer: {
    width: '100%',
    height: 110,
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  notesInput: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    padding: 0,
  },
  truncationWarning: {
    marginTop: 8,
    fontSize: 12,
    color: PALETTE.feedback.warning,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: 18,
    width: '100%',
    maxWidth: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    alignSelf: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonPressed: {
    backgroundColor: PALETTE.primaryPressed,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: PALETTE.text.light,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  },
  stateButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: 25,
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: {
    color: PALETTE.text.light,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
