import type { ProfessionalLookupResponse } from '@nutrikids/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { ProfessionalResultCard } from '../../components/ProfessionalResultCard.js';
import { PillField } from '../../components/ui/PillField.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { SecondaryButton } from '../../components/ui/SecondaryButton.js';
import { PALETTE } from '../../constants/colors.js';
import { SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatChildAge } from '../../lib/children-api.js';
import {
  ProfessionalApiError,
  linkProfessional,
  lookupProfessional,
} from '../../lib/professionals-api.js';

interface LookupResult {
  professional: ProfessionalLookupResponse;
  license: string;
}

export default function LinkProfessionalScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common', 'errors']);
  const params = useLocalSearchParams<{ childId?: string }>();
  const { status, children, load } = useChildren();

  const [license, setLicense] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    void load();
  }, [load]);

  const child = children.find((c) => c.id === params.childId) ?? null;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.CAREGIVER.MY_DATA);
  };

  const clearFeedback = () => {
    setErrorMessage(null);
    setConsentRequired(false);
  };

  const handleSearch = async () => {
    if (busy.current) return;
    clearFeedback();
    setResult(null);
    const trimmed = license.trim();
    if (!trimmed) {
      setErrorMessage(t('linkProfessional.licenseRequired'));
      return;
    }
    busy.current = true;
    setSearching(true);
    try {
      const professional = await lookupProfessional(trimmed);
      setResult({ professional, license: trimmed });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errors:professionals.lookup'));
    } finally {
      busy.current = false;
      setSearching(false);
    }
  };

  const handleLink = async () => {
    if (!child || !result || busy.current) return;
    clearFeedback();
    busy.current = true;
    setLinking(true);
    try {
      await linkProfessional(child.id, result.professional.professionalId);
      const name = `${result.professional.firstName} ${result.professional.lastName}`;
      Alert.alert(
        t('linkProfessional.successTitle'),
        t('linkProfessional.successMessage', { name, child: child.firstName }),
        [{ text: t('linkProfessional.ok'), onPress: handleBack }],
      );
    } catch (err) {
      if (err instanceof ProfessionalApiError && err.status === 403) {
        // 403: falta el consentimiento vigente o el usuario no es representante legal.
        if (/consentimiento/i.test(err.message)) setConsentRequired(true);
        else setErrorMessage(t('linkProfessional.notLegalRepresentative'));
      } else {
        setErrorMessage(err instanceof Error ? err.message : t('errors:professionals.link'));
      }
    } finally {
      busy.current = false;
      setLinking(false);
    }
  };

  const handleGoToConsent = () => {
    if (!child) return;
    router.push({
      pathname: APP_ROUTES.CAREGIVER.CONSENT as never,
      params: { childId: child.id, childName: child.firstName, mode: 'view' },
    });
  };

  const header = (
    <ScreenHeader
      title={t('linkProfessional.title')}
      backLabel={t('linkProfessional.back')}
      onBack={handleBack}
      style={styles.header}
      testID="link-professional-header"
    />
  );

  if (!child) {
    const loading = status === 'idle' || status === 'loading';
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content}>
          {header}
          <View style={styles.stateBox} testID="link-professional-state">
            {loading ? (
              <ActivityIndicator color={PALETTE.primary} />
            ) : (
              <Text style={styles.stateText}>{t('linkProfessional.missingChild')}</Text>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const specialty = result ? t(`common:specialties.${result.professional.specialty}`) : '';

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right', 'bottom']}
      testID="caregiver-link-professional-screen"
    >
      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        {header}

        <ChildBanner
          name={`${child.firstName} ${child.lastName}`}
          subtitle={t('linkProfessional.childSubtitle', { age: formatChildAge(child.birthDate) })}
          style={styles.banner}
          testID="link-professional-banner"
        />

        {errorMessage ? (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            testID="link-professional-error"
          >
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {consentRequired ? (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            testID="link-professional-consent"
          >
            <Text style={styles.errorText}>
              {t('linkProfessional.consentRequired', { child: child.firstName })}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.consentButton, pressed && styles.pressed]}
              onPress={handleGoToConsent}
              accessibilityRole="button"
              accessibilityLabel={t('linkProfessional.goToConsent')}
              testID="link-professional-go-consent"
            >
              <Text style={styles.consentButtonText}>{t('linkProfessional.goToConsent')}</Text>
            </Pressable>
          </View>
        ) : null}

        <PillField
          label={t('linkProfessional.licenseLabel')}
          testID="link-professional-license-field"
        >
          <KeyboardAwareTextInput
            style={styles.input}
            value={license}
            onChangeText={(value) => {
              setLicense(value);
              setResult(null);
              clearFeedback();
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={t('linkProfessional.licensePlaceholder')}
            placeholderTextColor={PALETTE.input.placeholder}
            accessibilityLabel={t('linkProfessional.licenseLabel')}
            returnKeyType="search"
            onSubmitEditing={() => void handleSearch()}
            testID="link-professional-license-input"
          />
        </PillField>
        <Text style={styles.hint}>{t('linkProfessional.licenseHint')}</Text>

        <View style={styles.center}>
          <SecondaryButton
            label={searching ? t('linkProfessional.searching') : t('linkProfessional.search')}
            onPress={() => void handleSearch()}
            loading={searching}
            disabled={searching || linking}
            testID="link-professional-search"
          />
        </View>

        {result ? (
          <View style={styles.resultWrapper}>
            <ProfessionalResultCard
              firstName={result.professional.firstName}
              lastName={result.professional.lastName}
              detail={t('linkProfessional.resultDetail', { specialty, license: result.license })}
              note={t('linkProfessional.resultNote', { child: child.firstName })}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            label={
              linking
                ? t('linkProfessional.linking')
                : t('linkProfessional.link', { child: child.firstName })
            }
            onPress={() => void handleLink()}
            loading={linking}
            disabled={!result || linking || searching}
            testID="link-professional-submit"
          />
          <SecondaryButton
            label={t('linkProfessional.cancel')}
            onPress={handleBack}
            disabled={linking}
            testID="link-professional-cancel"
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  content: { paddingHorizontal: SCREEN_MARGIN, paddingTop: 12, paddingBottom: 36 },
  header: { paddingHorizontal: 0, paddingTop: 0, marginBottom: 16 },
  banner: { marginBottom: 24 },
  input: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    paddingVertical: 8,
  },
  hint: {
    fontFamily: font('regular'),
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 6,
    marginLeft: 8,
    marginBottom: 18,
  },
  center: { alignItems: 'center' },
  resultWrapper: { marginTop: 22 },
  actions: { alignItems: 'center', gap: 12, marginTop: 32 },
  errorBanner: {
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.feedback.error,
    fontSize: 13,
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
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
    fontSize: 13,
  },
  stateBox: { alignItems: 'center', paddingVertical: 32 },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
  },
  pressed: { opacity: 0.85 },
});
