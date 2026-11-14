import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';

/** Minimal placeholder: the full alert detail is NK-33. Hidden from the drawer in the layout. */
export default function AlertDetailScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.PROFESSIONAL.ALERTS);
  };

  return (
    <View style={styles.container} testID="alert-detail-screen">
      <Text style={styles.title}>{t('professional:alertDetail.title')}</Text>
      <Text style={styles.body}>{t('professional:alertDetail.idLabel', { id: alertId })}</Text>
      <Text style={styles.body}>{t('professional:alertDetail.placeholder')}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={goBack}
        accessibilityRole="button"
        testID="alert-detail-back"
      >
        <Text style={styles.buttonText}>{t('common:actions.back')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: PALETTE.text.title },
  body: { fontSize: 14, color: PALETTE.text.body },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  pressed: { opacity: 0.8 },
  buttonText: { color: PALETTE.text.light, fontSize: 15, fontWeight: '600' },
});
