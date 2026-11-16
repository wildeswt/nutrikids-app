import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// SecureStore is a native module: simulate it with an in-memory map.
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

import { LanguageSelector } from '../components/LanguageSelector.js';
import { formatAge, formatLongDate, formatShortDate } from '../i18n/format.js';
import i18n from '../i18n/index.js';
import {
  LANGUAGE_STORAGE_KEY,
  changeAppLanguage,
  getStoredLanguage,
  restoreLanguagePreference,
} from '../i18n/language.js';

describe('Language selector (Español / Kichwa)', () => {
  afterEach(async () => {
    store.clear();
    await i18n.changeLanguage('es');
  });

  it('shows both options named in their own language, with Spanish selected by default', () => {
    const html = renderToString(React.createElement(LanguageSelector));

    expect(html).toContain('Idioma');
    expect(html).toContain('Español');
    expect(html).toContain('Kichwa');
    expect(html).toContain('data-testid="language-option-es"');
    expect(html).not.toContain(i18n.getFixedT('qu', 'common')('language.draftNotice'));
  });

  it('switches the app to Kichwa, remembers it and warns that the translation is a draft', async () => {
    await changeAppLanguage('qu');

    expect(i18n.language).toBe('qu');
    expect(store.get(LANGUAGE_STORAGE_KEY)).toBe('qu');
    expect(await getStoredLanguage()).toBe('qu');

    const html = renderToString(React.createElement(LanguageSelector));
    expect(html).toContain('Shimi');
    expect(html).toContain(i18n.t('common:language.draftNotice'));

    // Kichwa does not inflect nouns after numbers ("3 wata 5 killa").
    expect(formatAge(41)).toBe('3 wata 5 killa');

    // Month names come from the Kichwa translation files, not from the device.
    expect(formatLongDate('2026-10-18')).toBe('18 wayru killa 2026');
    expect(formatShortDate('2026-10-16')).toBe('16 wayru');
    expect(formatShortDate('2026-01-05')).toBe('5 kulla');
  });

  it('restores the saved language on startup and ignores unknown values', async () => {
    store.set(LANGUAGE_STORAGE_KEY, 'qu');
    await restoreLanguagePreference();
    expect(i18n.language).toBe('qu');

    await i18n.changeLanguage('es');
    store.set(LANGUAGE_STORAGE_KEY, 'xx');
    await restoreLanguagePreference();
    expect(i18n.language).toBe('es');
  });
});
