import type {
  CreateFeedingLogInput,
  FeedingLogResponse,
  ListFeedingLogsQuery,
} from '@nutrikids/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';
import { assertActiveConsent } from './children.service.js';

type FeedingLogRow = Prisma.FeedingLogGetPayload<object>;

export interface FeedingLogWriteResult {
  feedingLog: FeedingLogResponse;
  /** `true` if the log was created in this call; `false` if an idempotent resend returned it. */
  created: boolean;
}

const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

function formatFeedingLog(row: FeedingLogRow): FeedingLogResponse {
  return {
    id: row.id,
    childId: row.childId,
    logDate: toDateString(row.logDate),
    mealsPerDay: row.mealsPerDay,
    details: row.details,
  };
}

const DUPLICATE_ID_MESSAGE = 'Ya existe un registro de alimentación con ese identificador';

/**
 * Records a feeding log (RF-06). Idempotent by client-generated `id`: the insert is
 * `ON CONFLICT (id) DO NOTHING` (`createMany` + `skipDuplicates`), so a resend, even a concurrent
 * one, returns the stored log (200) without duplicating. An id owned by another child, or not
 * visible to the user under RLS, is a conflict (409).
 */
export async function createFeedingLog(
  auth: AuthContext,
  childId: string,
  input: CreateFeedingLogInput,
): Promise<FeedingLogWriteResult> {
  return withUser(auth.userId, async (tx) => {
    await assertActiveConsent(tx, childId);

    const child = await tx.child.findUnique({
      where: { id: childId },
      select: { birthDate: true },
    });
    if (!child) {
      throw HttpError.notFound('Niño no encontrado');
    }

    // ISO dates (`YYYY-MM-DD`) compare correctly as strings. Local "today" is never ahead of UTC's.
    if (input.logDate > toDateString(new Date())) {
      throw HttpError.badRequest('La fecha del registro no puede estar en el futuro');
    }
    if (input.logDate < toDateString(child.birthDate)) {
      throw HttpError.badRequest('La fecha del registro no puede ser anterior al nacimiento');
    }

    const { count } = await tx.feedingLog.createMany({
      data: [
        {
          id: input.id,
          childId,
          logDate: new Date(`${input.logDate}T00:00:00.000Z`),
          mealsPerDay: input.mealsPerDay,
          details: input.details ?? null,
        },
      ],
      skipDuplicates: true,
    });

    const stored = await tx.feedingLog.findUnique({ where: { id: input.id } });
    if (!stored || stored.childId !== childId) {
      throw HttpError.conflict(DUPLICATE_ID_MESSAGE);
    }
    return { feedingLog: formatFeedingLog(stored), created: count === 1 };
  });
}

/** Feeding logs of a child, newest day first. The route must verify the link (`requireLink`). */
export async function listFeedingLogs(
  auth: AuthContext,
  childId: string,
  query: ListFeedingLogsQuery,
): Promise<FeedingLogResponse[]> {
  const { from, to, limit } = query;
  const rows = await withUser(auth.userId, (tx) =>
    tx.feedingLog.findMany({
      where: {
        childId,
        ...(from || to
          ? {
              logDate: {
                ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ logDate: 'desc' }, { id: 'asc' }],
      take: limit,
    }),
  );
  return rows.map(formatFeedingLog);
}
