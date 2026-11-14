import { useTranslation } from 'react-i18next';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card.js';
import { PALETTE } from '../../constants/colors.js';
import { SCREEN_MARGIN } from '../../constants/layout.js';
import { font } from '../../constants/typography.js';

export default function ProfessionalChildrenScreen() {
  const { t } = useTranslation(['professional', 'common']);
  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>{t('children.title')}</Text>
        <Text style={styles.description}>{t('children.description')}</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
    paddingHorizontal: SCREEN_MARGIN,
    paddingVertical: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    gap: 12,
  },
  title: {
    fontFamily: font('semibold'),
    fontSize: 32,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
  description: {
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.body,
    lineHeight: 22,
  },
});
