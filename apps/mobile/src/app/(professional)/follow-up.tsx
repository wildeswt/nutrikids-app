import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';

/** Placeholder: the follow-up form is NK-34. Hidden from the drawer in the layout. */
export default function FollowUpScreen() {
  const { t } = useTranslation(['professional', 'common']);
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(APP_ROUTES.PROFESSIONAL.ALERTS);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.content} testID="follow-up-screen">
        <Text style={styles.title}>{t('professional:followUp.title')}</Text>
        <Text style={styles.body}>{t('professional:followUp.placeholder')}</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={goBack}
          accessibilityRole="button"
          testID="follow-up-back"
        >
          <Text style={styles.buttonText}>{t('common:actions.back')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  content: { padding: 30, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: PALETTE.text.title },
  body: { fontSize: 14, color: PALETTE.text.body },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  pressed: { opacity: 0.8 },
  buttonText: { color: PALETTE.text.light, fontSize: 15, fontWeight: '600' },
});
