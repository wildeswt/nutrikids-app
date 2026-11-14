import { vi } from 'vitest';

// expo-localization is a native module; tests run in Node with the base language.
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'es', languageTag: 'es-VE' }],
}));

await import('../i18n/index.js');
