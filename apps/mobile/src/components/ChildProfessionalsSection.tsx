import { filterActiveProfessionals } from '../lib/messages-api.js';
import type { ProfessionalAssignmentResponse } from '@nutrikids/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { APP_ROUTES } from '../constants/routes.js';
import { font } from '../constants/typography.js';
import { listLinkedProfessionals, unlinkProfessional } from '../lib/professionals-api.js';

interface ChildProfessionalsSectionProps {
  childId: string;
  childName: string;
}

/** Profesionales vigentes de un niño, con «Vincular profesional» y «Desvincular». */
export function ChildProfessionalsSection({ childId, childName }: ChildProfessionalsSectionProps) {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const [professionals, setProfessionals] = useState<ProfessionalAssignmentResponse[]>([]);

  const reload = useCallback(async () => {
    try {
      setProfessionals(filterActiveProfessionals(await listLinkedProfessionals(childId)));
    } catch {
      // Sin conexión o sin acceso: se deja la lista como está.
    }
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const confirmUnlink = (item: ProfessionalAssignmentResponse) => {
    const name = `${item.firstName} ${item.lastName}`;
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
                await unlinkProfessional(childId, item.professionalId);
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

  return (
    <View style={styles.container} testID={`my-data-professionals-${childId}`}>
      <Text style={styles.title}>{t('myData.professionalsTitle')}</Text>
      {professionals.length === 0 ? (
        <Text style={styles.empty}>{t('myData.noProfessionals')}</Text>
      ) : (
        professionals.map((item) => (
          <View key={item.professionalId} style={styles.row}>
            <Text style={styles.name}>
              {[
                `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
                item.specialty
                  ? t(`common:specialties.${item.specialty}`, { defaultValue: item.specialty })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Pressable
              onPress={() => confirmUnlink(item)}
              accessibilityRole="button"
              accessibilityLabel={`${t('myData.unlinkProfessional')} ${item.firstName} ${item.lastName}`}
              testID={`my-data-unlink-${item.professionalId}`}
            >
              <Text style={styles.unlink}>{t('myData.unlinkProfessional')}</Text>
            </Pressable>
          </View>
        ))
      )}
      <Pressable
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        onPress={() =>
          router.push({
            pathname: APP_ROUTES.CAREGIVER.LINK_PROFESSIONAL as never,
            params: { childId },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={t('myData.linkProfessional')}
        testID={`my-data-link-professional-${childId}`}
      >
        <Text style={styles.linkText}>{t('myData.linkProfessional')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4, marginTop: 6 },
  title: { fontFamily: font('medium'), fontWeight: '500', fontSize: 13, color: PALETTE.text.title },
  empty: { fontFamily: font('regular'), fontSize: 13, color: PALETTE.text.muted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1, fontFamily: font('regular'), fontSize: 13, color: PALETTE.text.body },
  unlink: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.feedback.error,
    textDecorationLine: 'underline',
  },
  link: { alignSelf: 'flex-start', paddingVertical: 2 },
  linkText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: PALETTE.primary,
  },
  pressed: { opacity: 0.85 },
});
