import { vi } from 'vitest';

// expo-constants mock for Node/Vitest.
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'mock-eas-project-id',
        },
      },
    },
  },
}));

// expo-localization is a native module; tests run in Node with the base language.
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'es', languageTag: 'es-VE' }],
}));

// expo-device and expo-notifications are native modules mocked in Node/Vitest.
vi.mock('expo-device', () => ({
  isDevice: true,
}));

vi.mock('expo-notifications', () => ({
  AndroidImportance: {
    MAX: 5,
  },
  AndroidNotificationPriority: {
    HIGH: 'high',
  },
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: vi.fn(async () => null),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: 'ExponentPushToken[mock-token]' })),
}));

await import('../i18n/index.js');
