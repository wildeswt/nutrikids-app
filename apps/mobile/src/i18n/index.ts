import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, DEFAULT_LANGUAGE, NAMESPACES, type AppLanguage } from './resources.js';

export {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  NAMESPACES,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from './resources.js';

/**
 * Resolves the app language from the device locale, falling back to Spanish (base language)
 * when the device language has no translation files yet.
 */
export function resolveDeviceLanguage(): AppLanguage {
  try {
    const deviceLanguages = getLocales().map((locale) => locale.languageCode);
    const match = deviceLanguages.find(
      (code): code is AppLanguage => !!code && Object.hasOwn(resources, code),
    );
    return match ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

if (!i18n.isInitialized) {
  // Resources are bundled, so initialization is synchronous (initAsync: false):
  // texts are available on the very first render and in server-side test renders.
  void i18n.use(initReactI18next).init({
    resources,
    lng: resolveDeviceLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    initAsync: false,
    react: { useSuspense: false },
  });
}

export default i18n;
