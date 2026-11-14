import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { LANGUAGE_OPTIONS, type AppLanguage } from '../i18n/index.js';
import { changeAppLanguage } from '../i18n/language.js';

interface LanguageSelectorProps {
  /** Shows the title and short description above the options. */
  showHeader?: boolean;
}

/**
 * Two-option language switch (Español / Kichwa). The choice applies right away and is
 * remembered on the device for the next launch.
 */
export function LanguageSelector({ showHeader = true }: LanguageSelectorProps) {
  const { t, i18n } = useTranslation('common');
  const activeLanguage = i18n.language as AppLanguage;
  const activeOption = LANGUAGE_OPTIONS.find((option) => option.code === activeLanguage);

  return (
    <View style={styles.container} testID="language-selector">
      {showHeader && (
        <>
          <Text style={styles.title}>{t('language.title')}</Text>
          <Text style={styles.description}>{t('language.description')}</Text>
        </>
      )}

      <View style={styles.optionsRow} accessibilityRole="radiogroup">
        {LANGUAGE_OPTIONS.map((option) => {
          const isSelected = option.code === activeLanguage;
          return (
            <Pressable
              key={option.code}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              onPress={() => void changeAppLanguage(option.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={t('language.selectA11y', { language: option.nativeName })}
              testID={`language-option-${option.code}`}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                {option.nativeName}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeOption?.draft && <Text style={styles.draftNotice}>{t('language.draftNotice')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  description: {
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  optionsRow: {
    flexDirection: 'row',
    backgroundColor: PALETTE.border.subtle,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
  },
  optionSelected: {
    backgroundColor: PALETTE.primary,
  },
  optionPressed: {
    opacity: 0.85,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  optionTextSelected: {
    color: PALETTE.text.light,
  },
  draftNotice: {
    fontSize: 12,
    color: PALETTE.feedback.warning,
    textAlign: 'center',
  },
});
