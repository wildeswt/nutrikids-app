import React from 'react';
import { vi } from 'vitest';

// @react-native-community/datetimepicker ships Flow source that Vite/Rolldown cannot parse in Node.
vi.mock('@react-native-community/datetimepicker', () => ({
  default: (props: Record<string, unknown>) => React.createElement('mock-date-picker', props),
}));

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
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getLastNotificationResponseAsync: vi.fn(async () => null),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: vi.fn(async () => null),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: 'ExponentPushToken[mock-token]' })),
}));

// expo-file-system is a native module: an in-memory file system stands in for it (the files live
// in `__files`, keyed by uri, so a test can read or seed them).
vi.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    readonly uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists(): boolean {
      return files.has(this.uri);
    }
    create(): void {
      files.set(this.uri, '');
    }
    async write(content: string): Promise<void> {
      files.set(this.uri, content);
    }
    async text(): Promise<string> {
      return files.get(this.uri) ?? '';
    }
  }
  return { File, Paths: { document: { uri: 'file:///documents' } }, __files: files };
});

// expo-sqlite es un módulo nativo; se provee un mock mínimo en memoria para Node/Vitest.
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async (databaseName: string) => {
    const database = {
      databasePath: databaseName,
      options: {},
      execAsync: vi.fn(async () => {}),
      runAsync: vi.fn(async () => ({ lastInsertRowId: 0, changes: 0 })),
      getFirstAsync: vi.fn(async () => ({ count: 0 })),
      getAllAsync: vi.fn(async () => []),
      closeAsync: vi.fn(async () => {}),
      withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
      withExclusiveTransactionAsync: vi.fn(async (task: (txn: unknown) => Promise<void>) =>
        task(database),
      ),
    };
    return database;
  }),
  deleteDatabaseAsync: vi.fn(async () => {}),
}));

// @react-native-community/netinfo es un módulo nativo; se mockea en Node/Vitest con estado configurable.
vi.mock('@react-native-community/netinfo', () => {
  const listeners = new Set<(state: Record<string, unknown>) => void>();
  const defaultState = {
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: { isConnectionExpensive: false },
  };
  const fetch = vi.fn(async () => defaultState);
  const refresh = vi.fn(async () => defaultState);
  const configure = vi.fn();
  const addEventListener = vi.fn((listener: (state: Record<string, unknown>) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const useNetInfo = vi.fn(() => defaultState);
  return {
    default: {
      configure,
      fetch,
      refresh,
      addEventListener,
      useNetInfo,
    },
    configure,
    fetch,
    refresh,
    addEventListener,
    useNetInfo,
    NetInfoStateType: {
      unknown: 'unknown',
      none: 'none',
      cellular: 'cellular',
      wifi: 'wifi',
      bluetooth: 'bluetooth',
      ethernet: 'ethernet',
      wimax: 'wimax',
      vpn: 'vpn',
      other: 'other',
    },
    __listeners: listeners,
    __emit: (state: Record<string, unknown>) => {
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
});

await import('../i18n/index.js');
