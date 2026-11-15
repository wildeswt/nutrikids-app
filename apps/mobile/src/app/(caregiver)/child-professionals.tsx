import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildBanner } from '../../components/ChildBanner.js';
import { ProfessionalResultCard } from '../../components/ProfessionalResultCard.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useChildren } from '../../hooks/useChildren.js';
import { formatChildAge } from '../../lib/children-api.js';
import { filterActiveProfessionals } from '../../lib/messages-api.js';
import { listLinkedProfessionals, unlinkProfessional } from '../../lib/professionals-api.js';
import type { ProfessionalAssignmentResponse } from '@nutrikids/shared';

/** Profesionales vinculados a un niño: se ven y se pueden desvincular o agregar otro. */
export default function ChildProfessionalsScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const params = useLocalSearchParams<{ childId?: string }>();
  const { children, load } = useChildren();
  const [professionals, setProfessionals] = useState<ProfessionalAssignmentResponse[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const childId = params.childId ?? null;
  const child = children.find((item) => item.id === childId) ?? null;

  const reload = useCallback(async () => {
    if (!childId) return;
    try {
      setProfessionals(filterActiveProfessionals(await listLinkedProfessionals(childId)));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [childId]);

  useEffect(() => {
    void load();
    void reload();
  }, [load, reload]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.CAREGIVER.MY_CHILDREN);
  };

  const confirmUnlink = (item: ProfessionalAssignmentResponse) => {
    const name = `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim();
    const childName = child?.firstName ?? '';
    Alert.alert(
      t('myData.unlinkConfirmTitle', { name }),
      t('myData.unlinkConfirmMessage', { name, child: childName }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('myData.unlinkConfirm'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await unlinkProfessional(item.childId, item.professionalId);
                await reload();
              } catch (err) {
                Alert.alert(
                  t('myData.unlinkError'),
                  err instanceof Error ? err.message : undefined,
                );
              }
            })();
          },
        },
      ],
    );
  };

  const goLink = () => {
    if (!childId) return;
    router.push({
      pathname: APP_ROUTES.CAREGIVER.LINK_PROFESSIONAL as never,
      params: { childId },
    });
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right', 'bottom']}
      testID="caregiver-child-professionals-screen"
    >
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title={t('childProfessionals.title')}
          backLabel={t('common:actions.back')}
          onBack={handleBack}
          style={styles.header}
          testID="child-professionals-header"
        />

        {child ? (
          <ChildBanner
            name={`${child.firstName} ${child.lastName}`}
            subtitle={formatChildAge(child.birthDate)}
            style={styles.banner}
            testID="child-professionals-banner"
          />
        ) : null}

        {status === 'loading' ? (
          <View style={styles.stateBox} testID="child-professionals-loading">
            <ActivityIndicator color={PALETTE.primary} />
          </View>
        ) : null}

        {status === 'error' ? (
          <View style={styles.stateBox} testID="child-professionals-error">
            <Text style={styles.stateText}>{t('childProfessionals.loadError')}</Text>
            <Pressable onPress={() => void reload()} accessibilityRole="button">
              <Text style={styles.link}>{t('home.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'ready' && professionals.length === 0 ? (
          <Text style={styles.stateText} testID="child-professionals-empty">
            {t('myData.noProfessionals')}
          </Text>
        ) : null}

        {professionals.map((item) => (
          <View key={item.professionalId} style={styles.item}>
            <ProfessionalResultCard
              firstName={item.firstName ?? ''}
              lastName={item.lastName ?? ''}
              detail={
                item.specialty
                  ? t('myChildren.professionalLinked', {
                      specialty: t(`common:specialties.${item.specialty}`, {
                        defaultValue: item.specialty,
                      }),
                    })
                  : ''
              }
              note={t('linkProfessional.resultNote', { child: child?.firstName ?? '' })}
              testID={`child-professional-${item.professionalId}`}
              footer={
                <Pressable
                  style={({ pressed }) => [styles.unlinkButton, pressed && styles.unlinkPressed]}
                  onPress={() => confirmUnlink(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('myData.unlinkProfessional')} ${item.firstName ?? ''} ${item.lastName ?? ''}`}
                  testID={`child-professional-unlink-${item.professionalId}`}
                >
                  <Ionicons name="person-remove-outline" size={16} color={PALETTE.feedback.error} />
                  <Text style={styles.unlinkText}>{t('myData.unlinkProfessional')}</Text>
                </Pressable>
              }
            />
          </View>
        ))}

        <View style={styles.actions}>
          <PrimaryButton
            label={t('childProfessionals.linkAnother')}
            onPress={goLink}
            testID="child-professionals-link"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  content: { paddingHorizontal: SCREEN_MARGIN, paddingTop: 12, paddingBottom: 36 },
  header: { paddingHorizontal: 0, paddingTop: 0, marginBottom: 16 },
  banner: { marginBottom: 24 },
  item: { marginBottom: 16 },
  unlinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: PALETTE.feedback.errorBorder,
    backgroundColor: PALETTE.feedback.errorBg,
  },
  unlinkPressed: {
    opacity: 0.85,
  },
  unlinkText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
  actions: { alignItems: 'center', marginTop: 24 },
  stateBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  stateText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.body,
    textAlign: 'center',
  },
  link: { fontFamily: font('semibold'), fontWeight: '600', color: PALETTE.primary },
});
