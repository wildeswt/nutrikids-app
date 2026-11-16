import {
  CaregiverCheckupResponseSchema,
  CheckupResponseSchema,
  ChildResponseSchema,
  type CaregiverCheckupResponse,
  type CheckupResponse,
  type ChildResponse,
  type ReferenceCurvesQuery,
  type ReferenceCurvesResponse,
} from '@nutrikids/shared';
import {
  checkupsRepository,
  childrenRepository,
  metaRepository,
  referenceCurvesRepository,
  type CachedReferenceCurve,
  type CheckupEntry,
} from './local-db/index.js';

function nowUtcIso(): string {
  return new Date().toISOString();
}
import { tryGetLocalDatabase, tryLocalOperation, type LocalCacheSnapshot } from './offline-read.js';

/** Vigencia de la caché local de curvas OMS antes de intentar refrescar (24 horas). */
export const REFERENCE_CURVES_TTL_MS = 24 * 60 * 60 * 1000;

/** Control mostrado en vistas del cuidador, marcando si aún está pendiente de envío. */
export type CaregiverCheckupListItem = CaregiverCheckupResponse & {
  localOnly?: boolean;
};

function childrenSyncMetaKey(userId: string): string {
  return `offline:children:syncedAt:${userId}`;
}

function caregiverCheckupsSyncMetaKey(userId: string, childId: string): string {
  return `offline:caregiverCheckups:syncedAt:${userId}:${childId}`;
}

function professionalCheckupsSyncMetaKey(userId: string, childId: string): string {
  return `offline:professionalCheckups:syncedAt:${userId}:${childId}`;
}

function parseTimestampMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Ordena controles del más reciente al más antiguo por `measuredAt` (y `createdAt`/`id` como desempate). */
export function sortCheckupsNewestFirst<
  T extends { measuredAt: string; createdAt: string; id: string },
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const measuredDiff = parseTimestampMs(b.measuredAt) - parseTimestampMs(a.measuredAt);
    if (measuredDiff !== 0) return measuredDiff;

    const measuredCmp = b.measuredAt.localeCompare(a.measuredAt);
    if (measuredCmp !== 0) return measuredCmp;

    const createdDiff = parseTimestampMs(b.createdAt) - parseTimestampMs(a.createdAt);
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id);
  });
}

function toCaregiverCheckupListItem(
  entry: CheckupEntry,
  userId: string,
): CaregiverCheckupListItem | null {
  if (entry.syncState === 'LOCAL') {
    // RF-14: nunca exponer puntajes z ni clasificaciones al cuidador.
    const candidate: CaregiverCheckupResponse = {
      id: entry.checkup.id,
      childId: entry.checkup.childId,
      measuredAt: entry.checkup.measuredAt,
      weightKg: entry.checkup.weightKg,
      lengthHeightCm: entry.checkup.lengthHeightCm,
      position: entry.checkup.position,
      origin: 'origin' in entry.checkup ? entry.checkup.origin : 'CAREGIVER',
      recordedById: 'recordedById' in entry.checkup ? entry.checkup.recordedById : userId,
      recordedBy: 'recordedBy' in entry.checkup ? entry.checkup.recordedBy : null,
      correctedCheckupId:
        'correctedCheckupId' in entry.checkup ? entry.checkup.correctedCheckupId : null,
      isCurrent: 'isCurrent' in entry.checkup ? entry.checkup.isCurrent : true,
      notes: entry.checkup.notes ?? null,
      createdAt: 'createdAt' in entry.checkup ? entry.checkup.createdAt : entry.createdAt,
    };
    const parsed = CaregiverCheckupResponseSchema.safeParse(candidate);
    if (!parsed.success) return null;
    return { ...parsed.data, localOnly: true };
  }

  const parsed = CaregiverCheckupResponseSchema.safeParse(entry.checkup);
  if (!parsed.success || !parsed.data.isCurrent) {
    return null;
  }
  return parsed.data;
}

/**
 * Combina controles confirmados del servidor con controles locales (`localOnly: true`)
 * que aún no han sido confirmados por el servidor, ordenados del más reciente al más antiguo.
 */
export function mergeServerAndLocalCheckups(
  serverCheckups: readonly CaregiverCheckupResponse[],
  localOnlyCheckups: readonly CaregiverCheckupListItem[],
): CaregiverCheckupListItem[] {
  const serverIds = new Set(serverCheckups.map((item) => item.id));
  const pendingLocal = localOnlyCheckups.filter(
    (item) => item.localOnly === true && !serverIds.has(item.id),
  );
  return sortCheckupsNewestFirst([...serverCheckups, ...pendingLocal]);
}

/** Lee la lista de niños en caché para `userId`. */
export async function readCachedChildren(
  userId: string,
): Promise<LocalCacheSnapshot<ChildResponse[]> | null> {
  const db = await tryGetLocalDatabase('children.read');
  if (!db) return null;

  return tryLocalOperation(
    'children.read',
    async () => {
      const [children, syncedAt, latestRow] = await Promise.all([
        childrenRepository.list(db, userId),
        metaRepository.get(db, childrenSyncMetaKey(userId)),
        db.getFirstAsync<{ latest: string | null }>(
          'SELECT MAX(updated_at) AS latest FROM children WHERE user_id = ?;',
          [userId],
        ),
      ]);

      if (syncedAt === null && children.length === 0) {
        return null;
      }

      return {
        data: children,
        lastSyncedAt: syncedAt ?? latestRow?.latest ?? null,
      };
    },
    null,
  );
}

/** Reemplaza en caché local todos los niños vinculados a `userId`. */
export async function writeCachedChildren(
  userId: string,
  children: readonly ChildResponse[],
): Promise<string | null> {
  const db = await tryGetLocalDatabase('children.write');
  if (!db) return null;

  return tryLocalOperation(
    'children.write',
    async () => {
      const syncedAt = nowUtcIso();
      await childrenRepository.replaceAll(db, userId, children, syncedAt);
      await metaRepository.set(db, childrenSyncMetaKey(userId), syncedAt);
      return syncedAt;
    },
    null,
  );
}

/** Elimina la caché local de niños de `userId` (p. ej. tras 403/404). */
export async function deleteCachedChildren(userId: string): Promise<void> {
  const db = await tryGetLocalDatabase('children.delete');
  if (!db) return;

  await tryLocalOperation(
    'children.delete',
    async () => {
      await childrenRepository.clear(db, userId);
      await metaRepository.remove(db, childrenSyncMetaKey(userId));
    },
    undefined,
  );
}

/** Inserta o actualiza un único niño en caché local sin borrar al resto. */
export async function upsertCachedChild(userId: string, child: ChildResponse): Promise<void> {
  const db = await tryGetLocalDatabase('children.upsert');
  if (!db) return;

  await tryLocalOperation(
    'children.upsert',
    async () => {
      const validated = ChildResponseSchema.parse(child);
      await childrenRepository.upsertMany(db, userId, [validated]);
    },
    undefined,
  );
}

/** Lee un niño específico de la caché local para el detalle de alerta del profesional. */
export async function readCachedChild(
  userId: string,
  childId: string,
): Promise<LocalCacheSnapshot<ChildResponse> | null> {
  const db = await tryGetLocalDatabase('child.read');
  if (!db) return null;

  return tryLocalOperation(
    'child.read',
    async () => {
      const child = await childrenRepository.get(db, userId, childId);
      if (!child) return null;
      const row = await db.getFirstAsync<{ updated_at: string }>(
        'SELECT updated_at FROM children WHERE user_id = ? AND id = ?;',
        [userId, childId],
      );
      return {
        data: child,
        lastSyncedAt: row?.updated_at ?? null,
      };
    },
    null,
  );
}

/** Elimina un niño específico de la caché local del usuario tras 403/404. */
export async function deleteCachedChild(userId: string, childId: string): Promise<void> {
  const db = await tryGetLocalDatabase('child.delete');
  if (!db) return;

  await tryLocalOperation(
    'child.delete',
    async () => {
      await db.runAsync('DELETE FROM children WHERE user_id = ? AND id = ?;', [userId, childId]);
    },
    undefined,
  );
}

/**
 * Lee los controles de un niño para el cuidador (RF-14), combinando los sincronizados (`SENT`)
 * con los pendientes locales (`LOCAL` marcados como `localOnly: true`), ordenados por fecha.
 */
export async function readCachedCaregiverCheckups(
  userId: string,
  childId: string,
): Promise<LocalCacheSnapshot<CaregiverCheckupListItem[]> | null> {
  const db = await tryGetLocalDatabase('checkups.read');
  if (!db) return null;

  return tryLocalOperation(
    'checkups.read',
    async () => {
      const [entries, syncedAt] = await Promise.all([
        checkupsRepository.listEntriesByChild(db, userId, childId),
        metaRepository.get(db, caregiverCheckupsSyncMetaKey(userId, childId)),
      ]);

      const items: CaregiverCheckupListItem[] = [];
      let latestSentCreatedAt: string | null = null;

      for (const entry of entries) {
        const mapped = toCaregiverCheckupListItem(entry, userId);
        if (mapped) {
          items.push(mapped);
          if (entry.syncState === 'SENT' && latestSentCreatedAt === null) {
            latestSentCreatedAt = entry.createdAt;
          }
        }
      }

      if (syncedAt === null && items.length === 0) {
        return null;
      }

      return {
        data: sortCheckupsNewestFirst(items),
        lastSyncedAt: syncedAt ?? latestSentCreatedAt,
      };
    },
    null,
  );
}

/** Lee únicamente los controles pendientes locales (`sync_state = 'LOCAL'`) de un niño. */
export async function readLocalOnlyCheckups(
  userId: string,
  childId: string,
): Promise<CaregiverCheckupListItem[]> {
  const db = await tryGetLocalDatabase('checkups.readLocalOnly');
  if (!db) return [];

  return tryLocalOperation(
    'checkups.readLocalOnly',
    async () => {
      const entries = await checkupsRepository.listEntriesByChild(db, userId, childId);
      const localItems: CaregiverCheckupListItem[] = [];
      for (const entry of entries) {
        if (entry.syncState !== 'LOCAL') continue;
        const mapped = toCaregiverCheckupListItem(entry, userId);
        if (mapped) localItems.push(mapped);
      }
      return sortCheckupsNewestFirst(localItems);
    },
    [],
  );
}

/**
 * Reemplaza los controles `'SENT'` en caché de un niño con la respuesta exacta del cuidador
 * (RF-14: sin puntajes z ni clasificaciones), preservando los controles `'LOCAL'`.
 */
export async function writeCachedCaregiverCheckups(
  userId: string,
  childId: string,
  checkups: readonly CaregiverCheckupResponse[],
): Promise<string | null> {
  const db = await tryGetLocalDatabase('checkups.write');
  if (!db) return null;

  return tryLocalOperation(
    'checkups.write',
    async () => {
      const sanitized = checkups.map((item) => CaregiverCheckupResponseSchema.parse(item));
      const syncedAt = nowUtcIso();
      await checkupsRepository.replaceSentByChild(db, userId, childId, sanitized);
      await metaRepository.set(db, caregiverCheckupsSyncMetaKey(userId, childId), syncedAt);
      return syncedAt;
    },
    null,
  );
}

/** Elimina los controles `'SENT'` en caché de un niño tras 403/404. */
export async function deleteCachedCaregiverCheckups(
  userId: string,
  childId: string,
): Promise<void> {
  const db = await tryGetLocalDatabase('checkups.delete');
  if (!db) return;

  await tryLocalOperation(
    'checkups.delete',
    async () => {
      await checkupsRepository.deleteSentByChild(db, userId, childId);
      await metaRepository.remove(db, caregiverCheckupsSyncMetaKey(userId, childId));
    },
    undefined,
  );
}

/** Lee los controles completos (vista profesional) desde la caché local. */
export async function readCachedProfessionalCheckups(
  userId: string,
  childId: string,
): Promise<LocalCacheSnapshot<CheckupResponse[]> | null> {
  const db = await tryGetLocalDatabase('professionalCheckups.read');
  if (!db) return null;

  return tryLocalOperation(
    'professionalCheckups.read',
    async () => {
      const [entries, syncedAt] = await Promise.all([
        checkupsRepository.listEntriesByChild(db, userId, childId),
        metaRepository.get(db, professionalCheckupsSyncMetaKey(userId, childId)),
      ]);

      const checkups: CheckupResponse[] = [];
      for (const entry of entries) {
        if (entry.syncState !== 'SENT') continue;
        const parsed = CheckupResponseSchema.safeParse(entry.checkup);
        if (parsed.success) {
          checkups.push(parsed.data);
        }
      }

      if (syncedAt === null && checkups.length === 0) {
        return null;
      }

      return {
        data: sortCheckupsNewestFirst(checkups),
        lastSyncedAt: syncedAt,
      };
    },
    null,
  );
}

/** Guarda los controles completos (vista profesional) en caché local. */
export async function writeCachedProfessionalCheckups(
  userId: string,
  childId: string,
  checkups: readonly CheckupResponse[],
): Promise<string | null> {
  const db = await tryGetLocalDatabase('professionalCheckups.write');
  if (!db) return null;

  return tryLocalOperation(
    'professionalCheckups.write',
    async () => {
      const validated = checkups.map((item) => CheckupResponseSchema.parse(item));
      const syncedAt = nowUtcIso();
      await checkupsRepository.replaceSentByChild(db, userId, childId, validated);
      await metaRepository.set(db, professionalCheckupsSyncMetaKey(userId, childId), syncedAt);
      return syncedAt;
    },
    null,
  );
}

/** Elimina los controles en caché de la vista profesional tras 403/404. */
export async function deleteCachedProfessionalCheckups(
  userId: string,
  childId: string,
): Promise<void> {
  const db = await tryGetLocalDatabase('professionalCheckups.delete');
  if (!db) return;

  await tryLocalOperation(
    'professionalCheckups.delete',
    async () => {
      await checkupsRepository.deleteSentByChild(db, userId, childId);
      await metaRepository.remove(db, professionalCheckupsSyncMetaKey(userId, childId));
    },
    undefined,
  );
}

/** Indica si una curva OMS en caché tiene menos de 24 horas desde su descarga. */
export function isReferenceCurveFresh(fetchedAt: string, nowMs: number = Date.now()): boolean {
  const fetchedMs = Date.parse(fetchedAt);
  if (Number.isNaN(fetchedMs)) {
    return false;
  }
  return nowMs - fetchedMs < REFERENCE_CURVES_TTL_MS;
}

/** Lee una curva OMS en caché por indicador, sexo y posición. */
export async function readCachedReferenceCurve(
  query: ReferenceCurvesQuery,
): Promise<CachedReferenceCurve | null> {
  const db = await tryGetLocalDatabase('referenceCurves.read');
  if (!db) return null;

  return tryLocalOperation(
    'referenceCurves.read',
    () => referenceCurvesRepository.get(db, query.indicator, query.sex, query.position),
    null,
  );
}

/** Guarda una curva OMS en caché con la fecha actual UTC. */
export async function writeCachedReferenceCurve(
  query: ReferenceCurvesQuery,
  curve: ReferenceCurvesResponse,
): Promise<string | null> {
  const db = await tryGetLocalDatabase('referenceCurves.write');
  if (!db) return null;

  return tryLocalOperation(
    'referenceCurves.write',
    async () => {
      const fetchedAt = nowUtcIso();
      await referenceCurvesRepository.put(
        db,
        query.indicator,
        query.sex,
        query.position,
        curve,
        fetchedAt,
      );
      return fetchedAt;
    },
    null,
  );
}

/** Elimina una curva OMS en caché tras recibir 403/404. */
export async function deleteCachedReferenceCurve(query: ReferenceCurvesQuery): Promise<void> {
  const db = await tryGetLocalDatabase('referenceCurves.delete');
  if (!db) return;

  await tryLocalOperation(
    'referenceCurves.delete',
    async () => {
      await referenceCurvesRepository.delete(db, query.indicator, query.sex, query.position);
    },
    undefined,
  );
}
