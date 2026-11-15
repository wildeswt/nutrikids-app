import type {
  CaregiverCheckupResponse,
  ChildResponse,
  ReferenceCurvesQuery,
  ReferenceCurvesResponse,
  SyncCheckupItem,
} from '@nutrikids/shared';
import NetInfo from '@react-native-community/netinfo';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db';
import { checkupsRepository, runMigrations } from '../lib/local-db/index';

const USER_1 = '11111111-1111-4111-8111-111111111111';
const USER_2 = '22222222-2222-4222-8222-222222222222';
const CHILD_1 = '33333333-3333-4333-8333-333333333333';
const CHILD_2 = '44444444-4444-4444-8444-444444444444';
const CHILD_ANON = '44444444-4444-4444-8444-444444444445';
const CHILD_NET = '44444444-4444-4444-8444-444444444446';
const CHK_OLD = '55555555-5555-4555-8555-555555555551';
const CHK_LOCAL = '55555555-5555-4555-8555-555555555552';
const CHK_NEW = '55555555-5555-4555-8555-555555555553';
const CHK_RF14 = '55555555-5555-4555-8555-555555555554';
const CHK_ONLY = '55555555-5555-4555-8555-555555555555';

const testMocks = vi.hoisted(() => ({
  activeDb: null as SqliteTestDb | null,
  dbOpenError: null as Error | null,
  currentAuth: {
    user: { id: '11111111-1111-4111-8111-111111111111', role: 'CAREGIVER' as const },
  } as { user: { id: string; role: 'CAREGIVER' | 'PROFESSIONAL' } } | null,
  fetchCaregiverChildren: vi.fn(),
  createChild: vi.fn(),
  fetchChildCheckups: vi.fn(),
  createChildCheckup: vi.fn(),
  fetchReferenceCurves: vi.fn(),
  hookStates: [] as unknown[],
  stateCursor: 0,
  renderFn: null as (() => unknown) | null,
  lastHookValue: null as unknown,
}));

function reRenderHook() {
  if (!testMocks.renderFn) return;
  testMocks.stateCursor = 0;
  testMocks.lastHookValue = testMocks.renderFn();
}

function mountHook<T>(hook: () => T): { current: () => T } {
  testMocks.hookStates = [];
  testMocks.stateCursor = 0;
  testMocks.renderFn = hook;
  testMocks.lastHookValue = hook();
  return {
    current: () => testMocks.lastHookValue as T,
  };
}

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    useState: <T>(initial: T | (() => T)) => {
      const idx = testMocks.stateCursor++;
      if (!(idx in testMocks.hookStates)) {
        testMocks.hookStates[idx] =
          typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (updater: T | ((prev: T) => T)) => {
        const prev = testMocks.hookStates[idx] as T;
        testMocks.hookStates[idx] =
          typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        reRenderHook();
      };
      return [testMocks.hookStates[idx] as T, setState] as const;
    },
    useRef: <T>(initial: T) => {
      const idx = testMocks.stateCursor++;
      if (!(idx in testMocks.hookStates)) {
        testMocks.hookStates[idx] = { current: initial };
      }
      return testMocks.hookStates[idx] as { current: T };
    },
    useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    useEffect: () => {},
    useContext: () => null,
  };
});

vi.mock('../context/auth-context.js', () => ({
  useOptionalAuth: () => testMocks.currentAuth,
}));

vi.mock('../lib/local-db/database.js', () => ({
  getLocalDatabase: vi.fn(async () => {
    if (testMocks.dbOpenError) throw testMocks.dbOpenError;
    if (!testMocks.activeDb) throw new Error('SQLCipher unavailable');
    return testMocks.activeDb;
  }),
  resetLocalDatabaseForTests: vi.fn(),
}));

vi.mock('../lib/children-api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    fetchCaregiverChildren: (...args: unknown[]) => testMocks.fetchCaregiverChildren(...args),
    createChild: (...args: unknown[]) => testMocks.createChild(...args),
  };
});

vi.mock('../lib/checkups-api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    fetchChildCheckups: (...args: unknown[]) => testMocks.fetchChildCheckups(...args),
    createChildCheckup: (...args: unknown[]) => testMocks.createChildCheckup(...args),
  };
});

vi.mock('../lib/reference-api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    fetchReferenceCurves: (...args: unknown[]) => testMocks.fetchReferenceCurves(...args),
  };
});

import { useCheckups } from '../hooks/useCheckups';
import { useChildren } from '../hooks/useChildren';
import { useReferenceCurves } from '../hooks/useReferenceCurves';

function setOnline(online: boolean) {
  vi.mocked(NetInfo.fetch).mockResolvedValue({
    isConnected: online,
    isInternetReachable: online,
    type: online ? 'wifi' : 'none',
    details: null,
  } as never);
}

function makeChild(overrides: Partial<ChildResponse> = {}): ChildResponse {
  return {
    id: CHILD_1,
    firstName: 'Sofía',
    lastName: 'Quispe',
    birthDate: '2024-06-15',
    sex: 'FEMALE',
    ...overrides,
  };
}

function makeCaregiverCheckup(
  overrides: Partial<CaregiverCheckupResponse> = {},
): CaregiverCheckupResponse {
  return {
    id: CHK_OLD,
    childId: CHILD_1,
    measuredAt: '2026-11-10T10:00:00.000Z',
    weightKg: 11.4,
    lengthHeightCm: 84.5,
    position: 'STANDING',
    origin: 'CAREGIVER',
    recordedById: USER_1,
    recordedBy: {
      userId: USER_1,
      firstName: 'Ana',
      lastName: 'Quispe',
      role: 'CAREGIVER',
      specialty: null,
    },
    correctedCheckupId: null,
    isCurrent: true,
    notes: 'Control normal',
    createdAt: '2026-11-10T10:05:00.000Z',
    ...overrides,
  };
}

function makeCurves(query: ReferenceCurvesQuery): ReferenceCurvesResponse {
  return {
    version: 'WHO 2006',
    indicator: query.indicator,
    sex: query.sex,
    xAxis: query.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT' ? 'height_cm' : 'age_months',
    curves: {
      '-3': [{ x: 12, y: 7 }],
      '-2': [{ x: 12, y: 8 }],
      '0': [{ x: 12, y: 9.5 }],
      '+2': [{ x: 12, y: 11 }],
      '+3': [{ x: 12, y: 12 }],
    },
  };
}

describe('hooks con lectura sin conexión (NK-60)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testMocks.fetchCaregiverChildren.mockReset();
    testMocks.createChild.mockReset();
    testMocks.fetchChildCheckups.mockReset();
    testMocks.createChildCheckup.mockReset();
    testMocks.fetchReferenceCurves.mockReset();
    testMocks.dbOpenError = null;
    testMocks.currentAuth = { user: { id: USER_1, role: 'CAREGIVER' } };
    setOnline(true);
    testMocks.activeDb = createSqliteTestDb();
    await runMigrations(testMocks.activeDb);
  });

  afterEach(() => {
    if (testMocks.activeDb) {
      testMocks.activeDb.close();
      testMocks.activeDb = null;
    }
    vi.restoreAllMocks();
  });

  describe('useChildren', () => {
    it('guarda la lista del servidor y elimina niños que ya no llegan al refrescar', async () => {
      const child1 = makeChild({ id: CHILD_1, firstName: 'Niño Uno' });
      const child2 = makeChild({ id: CHILD_2, firstName: 'Niño Dos' });

      testMocks.fetchCaregiverChildren.mockResolvedValueOnce([child1, child2]);
      const hook = mountHook(() => useChildren());
      await hook.current().load();

      expect(hook.current().status).toBe('ready');
      expect(hook.current().children.map((c) => c.id)).toEqual([CHILD_1, CHILD_2]);
      expect(hook.current().fromCache).toBe(false);
      expect(hook.current().stale).toBe(false);

      // En el segundo refresco se desvinculó child-2; luego simulamos modo avión para leer caché.
      testMocks.fetchCaregiverChildren.mockResolvedValueOnce([child1]);
      await hook.current().load();

      setOnline(false);
      await hook.current().load();

      expect(hook.current().status).toBe('ready');
      expect(hook.current().children.map((c) => c.id)).toEqual([CHILD_1]);
      expect(hook.current().fromCache).toBe(true);
      expect(hook.current().stale).toBe(true);
      expect(hook.current().lastSyncedAt).toBeTruthy();
    });

    it('en primera carga sin conexión ni datos expone loadError needs-connection', async () => {
      setOnline(false);
      const hook = mountHook(() => useChildren());
      await hook.current().load();

      expect(hook.current().status).toBe('error');
      expect(hook.current().loadError).toBe('needs-connection');
      expect(testMocks.fetchCaregiverChildren).not.toHaveBeenCalled();
    });

    it('aísla los niños guardados por usuario y omite caché sin sesión', async () => {
      testMocks.fetchCaregiverChildren.mockResolvedValueOnce([makeChild({ id: CHILD_1 })]);
      const hook1 = mountHook(() => useChildren());
      await hook1.current().load();

      testMocks.currentAuth = { user: { id: USER_2, role: 'CAREGIVER' } };
      setOnline(false);
      const hook2 = mountHook(() => useChildren());
      await hook2.current().load();

      expect(hook2.current().status).toBe('error');
      expect(hook2.current().loadError).toBe('needs-connection');
      expect(hook2.current().children).toEqual([]);

      // Sin usuario autenticado no consulta ni escribe en SQLite.
      testMocks.currentAuth = null;
      setOnline(true);
      testMocks.fetchCaregiverChildren.mockResolvedValueOnce([makeChild({ id: CHILD_ANON })]);
      const hookAnon = mountHook(() => useChildren());
      await hookAnon.current().load();

      expect(hookAnon.current().children.map((c) => c.id)).toEqual([CHILD_ANON]);
    });

    it('degrada elegantemente cuando getLocalDatabase falla', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      testMocks.dbOpenError = new Error('SQLCipher not available in Expo Go');
      testMocks.fetchCaregiverChildren.mockResolvedValueOnce([makeChild({ id: CHILD_NET })]);

      const hook = mountHook(() => useChildren());
      await hook.current().load();

      expect(hook.current().status).toBe('ready');
      expect(hook.current().children.map((c) => c.id)).toEqual([CHILD_NET]);
      expect(hook.current().fromCache).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('useCheckups', () => {
    it('mezcla controles LOCAL con localOnly=true y controles del servidor ordenados por fecha', async () => {
      const serverOld = makeCaregiverCheckup({
        id: CHK_OLD,
        measuredAt: '2026-11-01T10:00:00.000Z',
      });
      const serverNew = makeCaregiverCheckup({
        id: CHK_NEW,
        measuredAt: '2026-11-12T10:00:00.000Z',
      });
      testMocks.fetchChildCheckups.mockResolvedValueOnce([serverOld, serverNew]);

      // Inserta un control pendiente LOCAL en medio cronológicamente.
      const localPending: SyncCheckupItem = {
        id: CHK_LOCAL,
        childId: CHILD_1,
        measuredAt: '2026-11-08T10:00:00.000Z',
        weightKg: 11.2,
        lengthHeightCm: 84,
        position: 'STANDING',
        notes: 'Guardado sin señal',
      };
      await checkupsRepository.insertLocal(testMocks.activeDb!, USER_1, localPending);

      const hook = mountHook(() => useCheckups(CHILD_1, { autoLoad: false }));
      await hook.current().load();

      expect(hook.current().status).toBe('ready');
      expect(hook.current().checkups.map((c) => [c.id, Boolean(c.localOnly)])).toEqual([
        [CHK_NEW, false],
        [CHK_LOCAL, true],
        [CHK_OLD, false],
      ]);

      // Ahora en modo avión debe volver a leer ambos desde SQLite.
      setOnline(false);
      await hook.current().load();

      expect(hook.current().fromCache).toBe(true);
      expect(hook.current().stale).toBe(true);
      expect(hook.current().checkups.map((c) => [c.id, Boolean(c.localOnly)])).toEqual([
        [CHK_NEW, false],
        [CHK_LOCAL, true],
        [CHK_OLD, false],
      ]);
    });

    it('respeta RF-14 al guardar y leer controles del cuidador sin puntajes z ni clasificaciones', async () => {
      const pollutedResponse = {
        ...makeCaregiverCheckup({ id: CHK_RF14 }),
        results: [{ indicator: 'WEIGHT_FOR_AGE', zScore: -2.4, classification: 'UNDERWEIGHT' }],
      };
      testMocks.fetchChildCheckups.mockResolvedValueOnce([pollutedResponse]);

      const hook = mountHook(() => useCheckups(CHILD_1, { autoLoad: false }));
      await hook.current().load();

      setOnline(false);
      await hook.current().load();

      const item = hook.current().checkups[0] as Record<string, unknown>;
      expect(item).toBeDefined();
      expect('results' in item).toBe(false);
      expect('zScore' in item).toBe(false);
      expect('classification' in item).toBe(false);
    });

    it('en primera carga sin red devuelve needs-connection y degrada si falla SQLCipher', async () => {
      setOnline(false);
      const hook = mountHook(() => useCheckups(CHILD_1, { autoLoad: false }));
      await hook.current().load();

      expect(hook.current().status).toBe('error');
      expect(hook.current().loadError).toBe('needs-connection');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      testMocks.dbOpenError = new Error('SQLCipher unavailable');
      setOnline(true);
      const serverCheckup = makeCaregiverCheckup({ id: CHK_ONLY });
      testMocks.fetchChildCheckups.mockResolvedValueOnce([serverCheckup]);

      await hook.current().load();
      expect(hook.current().status).toBe('ready');
      expect(hook.current().checkups.map((c) => c.id)).toEqual([CHK_ONLY]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('useReferenceCurves', () => {
    const query: ReferenceCurvesQuery = {
      indicator: 'WEIGHT_FOR_AGE',
      sex: 'FEMALE',
    };

    it('usa la copia local fresca (< 24 h) sin consultar al servidor', async () => {
      const serverCurves = makeCurves(query);
      testMocks.fetchReferenceCurves.mockResolvedValueOnce(serverCurves);

      const hook = mountHook(() => useReferenceCurves(query));
      await hook.current().load();

      expect(testMocks.fetchReferenceCurves).toHaveBeenCalledTimes(1);
      expect(hook.current().fromCache).toBe(false);
      expect(hook.current().stale).toBe(false);

      // Segunda lectura estando en línea: la copia tiene < 24 h, no llama a red.
      await hook.current().load();
      expect(testMocks.fetchReferenceCurves).toHaveBeenCalledTimes(1);
      expect(hook.current().fromCache).toBe(true);
      expect(hook.current().stale).toBe(false);
      expect(hook.current().curves).toEqual(serverCurves);
    });

    it('refresca cuando la copia tiene >= 24 h y cae a la copia vieja si falla la red', async () => {
      const oldCurves = makeCurves(query);
      const updatedCurves: ReferenceCurvesResponse = {
        ...oldCurves,
        curves: {
          ...oldCurves.curves,
          '0': [{ x: 12, y: 9.8 }],
        },
      };

      testMocks.fetchReferenceCurves.mockResolvedValueOnce(oldCurves);
      const hook = mountHook(() => useReferenceCurves(query));
      await hook.current().load();

      // Envejecemos manualmente fetched_at a 25 horas atrás.
      const staleIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const sql = 'UPDATE reference_curves SET fetched_at = ?;';
      await testMocks.activeDb!.runAsync(sql, [staleIso]);

      // Con red caída, usa la copia vieja y la marca stale.
      setOnline(false);
      await hook.current().load();
      expect(hook.current().status).toBe('ready');
      expect(hook.current().fromCache).toBe(true);
      expect(hook.current().stale).toBe(true);
      expect(hook.current().curves).toEqual(oldCurves);

      // Al volver la red, refresca desde el servidor y actualiza la copia local.
      setOnline(true);
      testMocks.fetchReferenceCurves.mockResolvedValueOnce(updatedCurves);
      await hook.current().load();

      expect(hook.current().status).toBe('ready');
      expect(hook.current().fromCache).toBe(false);
      expect(hook.current().stale).toBe(false);
      expect(hook.current().curves).toEqual(updatedCurves);
    });

    it('sin copia local ni conexión muestra error claro de curvas y degrada sin SQLCipher', async () => {
      setOnline(false);
      const hook = mountHook(() => useReferenceCurves(query));
      await hook.current().load();

      expect(hook.current().status).toBe('error');
      expect(hook.current().loadError).toBe('needs-connection');
      expect(hook.current().error).toBe('Conéctate una vez para descargar las curvas');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      testMocks.dbOpenError = new Error('SQLCipher unavailable');
      setOnline(true);
      testMocks.fetchReferenceCurves.mockResolvedValueOnce(makeCurves(query));
      await hook.current().load();

      expect(hook.current().status).toBe('ready');
      expect(hook.current().fromCache).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
