import type { AuthenticatedAuthResponse } from '../context/auth-context.js';
import { USER_ROLES } from '@nutrikids/shared';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secureStoreValues = vi.hoisted(() => new Map<string, string>());
const wipeState = vi.hoisted(() => ({
  shouldFail: false,
  calls: 0,
}));
const apiCallbacks = vi.hoisted(() => ({
  expiredListeners: new Set<() => void>(),
  logoutMock: vi.fn(async () => {}),
}));
const sqliteRef = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => secureStoreValues.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreValues.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreValues.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('../lib/local-db/wipe.js', () => ({
  wipeLocalData: vi.fn(async () => {
    wipeState.calls += 1;
    if (wipeState.shouldFail) {
      throw new Error('EIO: disk wipe failed');
    }
  }),
}));

vi.mock('../lib/local-db/database.js', () => ({
  LOCAL_DATABASE_NAME: 'nutrikids.db',
  getLocalDatabase: vi.fn(async () => {
    if (!sqliteRef.current) {
      throw new Error('SQLite unavailable in test');
    }
    return sqliteRef.current;
  }),
  closeLocalDatabase: vi.fn(async () => {}),
}));

vi.mock('../lib/push-notifications.js', () => ({
  initPushNotifications: vi.fn(),
  registerPushNotifications: vi.fn(async () => 'ExponentPushToken[test]'),
  unregisterPushNotifications: vi.fn(async () => {}),
}));

vi.mock('../lib/api.js', () => ({
  logoutSessionRequest: apiCallbacks.logoutMock,
  onSessionExpired: (listener: () => void) => {
    apiCallbacks.expiredListeners.add(listener);
    return () => {
      apiCallbacks.expiredListeners.delete(listener);
    };
  },
  onSessionUpdated: () => () => {},
  onSessionRefreshError: () => () => {},
}));

import { AuthProvider, useAuth, type AuthContextValue } from '../context/auth-context.js';
import { FOLLOW_UP_STORAGE_KEY, saveDraft as saveFollowUpDraft } from '../lib/follow-up-storage.js';
import { runMigrations, syncQueueRepository } from '../lib/local-db/index.js';
import {
  PENDING_WIPE_STORAGE_KEY,
  cleanupOnSessionExpired,
  hasUnsentSyncRecords,
  retryPendingLocalWipeIfNeeded,
  wipeUserLocalStorage,
} from '../lib/local-wipe.js';
import { loadReferralDraft, saveReferralDraft } from '../lib/referral-form.js';
import { getStoredSession } from '../lib/session-storage.js';
import { createSyncEngine, flushSyncQueue, readSyncStateFromDb } from '../lib/sync/sync-engine.js';
import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '99999999-9999-4999-8999-999999999999';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const RECIPIENT_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const ITEM_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const ITEM_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';

function makeAuthResponse(userId: string, email: string): AuthenticatedAuthResponse {
  return {
    accessToken: `access-${userId}`,
    refreshToken: `refresh-${userId}`,
    expiresIn: 3600,
    requiresTwoFactor: false,
    user: {
      id: userId,
      email,
      firstName: 'María',
      lastName: 'Pérez',
      roles: [USER_ROLES.CAREGIVER],
      specialty: null,
    },
  };
}

describe('local wipe, session expiration, and user isolation (NK-63)', () => {
  let db: SqliteTestDb;

  beforeEach(async () => {
    secureStoreValues.clear();
    wipeState.shouldFail = false;
    wipeState.calls = 0;
    apiCallbacks.expiredListeners.clear();
    apiCallbacks.logoutMock.mockClear();

    db = createSqliteTestDb();
    await runMigrations(db);
    sqliteRef.current = db;
  });

  afterEach(() => {
    sqliteRef.current = null;
    db.close();
  });

  it('stopAndWait halts SyncEngine and waits for an in-flight sync cycle to finish', async () => {
    await syncQueueRepository.enqueue(db, USER_A, {
      id: ITEM_1,
      kind: 'checkup',
      payload: {
        id: ITEM_1,
        childId: CHILD_ID,
        measuredAt: '2026-11-14T10:00:00.000Z',
        weightKg: 12.4,
        lengthHeightCm: 88.0,
        position: 'STANDING',
      },
    });

    let resolvePost!: () => void;
    let postFinished = false;
    const engine = createSyncEngine({
      getDb: async () => db,
      getConnectivity: async () => 'online',
      subscribeToConnectivity: () => () => {},
      subscribeToAppState: () => () => {},
      post: () =>
        new Promise((resolve) => {
          resolvePost = () => {
            postFinished = true;
            resolve({
              results: [],
            });
          };
        }),
    });

    const startPromise = engine.start(USER_A);
    // Permitir que arranque la petición HTTP simulada en vuelo.
    await new Promise((resolve) => setTimeout(resolve, 10));

    let stopResolved = false;
    const stopPromise = engine.stopAndWait().then(() => {
      stopResolved = true;
    });

    await Promise.resolve();
    expect(stopResolved).toBe(false);
    expect(postFinished).toBe(false);

    resolvePost();
    await Promise.all([startPromise, stopPromise]);

    expect(postFinished).toBe(true);
    expect(stopResolved).toBe(true);
    expect(engine.getSyncState()).toEqual({
      pending: 0,
      sending: 0,
      error: 0,
      lastSyncedAt: null,
    });
  });

  it('wipes encrypted DB, legacy SecureStore follow-up data, and referral drafts on manual signOut', async () => {
    secureStoreValues.set(
      FOLLOW_UP_STORAGE_KEY,
      JSON.stringify({
        drafts: {
          [`${USER_A}:child:${CHILD_ID}`]: {
            userId: USER_A,
            childId: CHILD_ID,
            form: {
              observations: 'Borrador confidencial',
              intervention: '',
              referral: '',
              nextCheckupText: '',
              establish: false,
            },
            savedAt: '2026-11-14T12:00:00.000Z',
          },
        },
        pending: [],
      }),
    );

    await saveReferralDraft(USER_A, {
      childId: CHILD_ID,
      recipientId: RECIPIENT_ID,
      priority: 'ordinary',
      reason: 'Derivación privada',
    });

    let auth!: AuthContextValue;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderToString(React.createElement(AuthProvider, null, React.createElement(Consumer)));

    await act(async () => {
      await auth.signIn(makeAuthResponse(USER_A, 'maria@example.com'));
    });

    await act(async () => {
      await auth.signOut();
    });

    expect(apiCallbacks.logoutMock).toHaveBeenCalledWith(`refresh-${USER_A}`);
    expect(wipeState.calls).toBe(1);
    expect(secureStoreValues.has(FOLLOW_UP_STORAGE_KEY)).toBe(false);
    expect(secureStoreValues.has(PENDING_WIPE_STORAGE_KEY)).toBe(false);
    expect(await loadReferralDraft(USER_A)).toBeNull();
    expect(await getStoredSession()).toBeNull();
  });

  it('still completes signOut if wipeLocalData fails, logs no PII, and retries on next startup', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    wipeState.shouldFail = true;

    let auth!: AuthContextValue;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderToString(React.createElement(AuthProvider, null, React.createElement(Consumer)));

    await act(async () => {
      await auth.signIn(makeAuthResponse(USER_A, 'maria.secreta@example.com'));
    });

    await act(async () => {
      await auth.signOut();
    });

    expect(apiCallbacks.logoutMock).toHaveBeenCalledWith(`refresh-${USER_A}`);
    expect(await getStoredSession()).toBeNull();
    expect(secureStoreValues.get(PENDING_WIPE_STORAGE_KEY)).toBe('1');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls.map((args) => args.join(' ')).join(' ');
    expect(logged).toContain('wipeLocalData');
    expect(logged).not.toContain(USER_A);
    expect(logged).not.toContain('maria.secreta@example.com');

    // Al próximo inicio de la app el borrado se reintenta y limpia la marca.
    wipeState.shouldFail = false;
    const callsBeforeStartup = wipeState.calls;
    const retried = await retryPendingLocalWipeIfNeeded();
    expect(retried).toBe(true);
    expect(wipeState.calls).toBe(callsBeforeStartup + 1);
    expect(secureStoreValues.has(PENDING_WIPE_STORAGE_KEY)).toBe(false);

    warnSpy.mockRestore();
  });

  it('conserves local DB and queue on automatic session expiration when unsent records exist, and wipes when none remain', async () => {
    await syncQueueRepository.enqueue(db, USER_A, {
      id: ITEM_1,
      kind: 'feeding',
      payload: {
        id: ITEM_1,
        childId: CHILD_ID,
        logDate: '2026-11-14',
        mealsPerDay: 3,
        details: 'Desayuno, almuerzo y cena',
      },
    });
    await syncQueueRepository.updateStatus(db, USER_A, ITEM_1, 'ERROR', {
      lastError: 'Error 422 del servidor',
    });

    const stopAndWaitMock = vi.fn(async () => {});
    const withPendingResult = await cleanupOnSessionExpired(USER_A, {
      stopAndWaitSync: stopAndWaitMock,
      getLocalDb: async () => db,
    });

    expect(stopAndWaitMock).toHaveBeenCalledTimes(1);
    expect(withPendingResult).toEqual({ hadUnsentRecords: true, wiped: false });
    expect(wipeState.calls).toBe(0);

    // También detecta pendientes en respaldo legacy de SecureStore aunque SQLite no tenga cola.
    await syncQueueRepository.updateStatus(db, USER_A, ITEM_1, 'SENT', {
      lastError: null,
    });
    secureStoreValues.set(
      FOLLOW_UP_STORAGE_KEY,
      JSON.stringify({
        drafts: {},
        pending: [
          {
            userId: USER_A,
            childId: CHILD_ID,
            establish: false,
            queuedAt: '2026-11-14T11:30:00.000Z',
            input: {
              items: [{ id: ITEM_2, type: 'observation', details: 'Seguimiento pendiente' }],
            },
          },
        ],
      }),
    );
    expect(await hasUnsentSyncRecords(USER_A, { getLocalDb: async () => db })).toBe(true);

    // Si la cola no se puede leer, se asume que hay pendientes y no se borra nada.
    secureStoreValues.delete(FOLLOW_UP_STORAGE_KEY);
    const unreadable = await cleanupOnSessionExpired(USER_A, {
      stopAndWaitSync: stopAndWaitMock,
      getLocalDb: async () => {
        throw new Error('base ilegible');
      },
    });
    expect(unreadable).toEqual({ hadUnsentRecords: true, wiped: false });
    secureStoreValues.set(
      FOLLOW_UP_STORAGE_KEY,
      JSON.stringify({
        drafts: {},
        pending: [
          {
            userId: USER_A,
            childId: CHILD_ID,
            establish: false,
            queuedAt: '2026-11-14T11:30:00.000Z',
            input: {
              items: [{ id: ITEM_2, type: 'observation', details: 'Seguimiento pendiente' }],
            },
          },
        ],
      }),
    );

    // Al eliminar el pendiente legacy y quedar solo ítems SENT, la expiración sí borra todo.
    secureStoreValues.delete(FOLLOW_UP_STORAGE_KEY);
    const withoutPendingResult = await cleanupOnSessionExpired(USER_A, {
      stopAndWaitSync: stopAndWaitMock,
      getLocalDb: async () => db,
    });

    expect(withoutPendingResult).toEqual({ hadUnsentRecords: false, wiped: true });
    expect(wipeState.calls).toBe(1);
  });

  it('isolates leftover pending records between two users on the same device', async () => {
    await syncQueueRepository.enqueue(db, USER_A, {
      id: ITEM_1,
      kind: 'checkup',
      payload: {
        id: ITEM_1,
        childId: CHILD_ID,
        measuredAt: '2026-11-14T10:00:00.000Z',
        weightKg: 11.1,
        lengthHeightCm: 82.0,
        position: 'RECUMBENT',
      },
    });
    await saveFollowUpDraft(`${USER_A}:child:${CHILD_ID}`, {
      userId: USER_A,
      childId: CHILD_ID,
      form: {
        observations: 'Solo visible para A',
        intervention: '',
        referral: '',
        nextCheckupText: '',
        establish: false,
      },
    });

    // Expira sesión de A con pendientes: se conserva su cola en el dispositivo.
    const expiredRes = await cleanupOnSessionExpired(USER_A, {
      stopAndWaitSync: async () => {},
      getLocalDb: async () => db,
    });
    expect(expiredRes).toEqual({ hadUnsentRecords: true, wiped: false });

    // Usuario B inicia sesión en el mismo teléfono: no ve ni envía registros de A.
    const stateForB = await readSyncStateFromDb(db, USER_B);
    expect(stateForB).toEqual({
      pending: 0,
      sending: 0,
      error: 0,
      lastSyncedAt: null,
    });

    const postMock = vi.fn();
    const summaryB = await flushSyncQueue({
      db,
      userId: USER_B,
      now: '2026-11-14T18:00:00.000Z',
      post: postMock,
      sendFollowUp: vi.fn(),
      sendFeeding: vi.fn(),
    });
    expect(summaryB.attempted).toBe(0);
    expect(postMock).not.toHaveBeenCalled();

    // Si el mismo usuario A vuelve a iniciar sesión, su registro sigue en cola listo para enviarse.
    const stateForA = await readSyncStateFromDb(db, USER_A);
    expect(stateForA.pending).toBe(1);

    await wipeUserLocalStorage({
      userId: USER_B,
      deps: { stopAndWaitSync: async () => {} },
    });
    expect(wipeState.calls).toBe(1);
    expect(ITEM_3).toBeDefined();
  });
});
