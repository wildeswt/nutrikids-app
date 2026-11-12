import crypto from 'node:crypto';
import type {
  CaregiverCheckupResponse,
  CheckupResponse,
  CorrectCheckupInput,
  CreateCheckupInput,
  IndicatorResult,
} from '@nutrikids/shared';
import {
  WHO_REFERENCE_VERSION,
  adjustLengthHeight,
  calculateZScore,
  classify,
  ageInMonths,
  getLmsParameters,
  percentileFromZScore,
  type MeasurementPosition,
  type WhoIndicator,
} from '@nutrikids/who-growth';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';
import { assertActiveConsent, assertChildAgeInOmsRange } from './children.service.js';

/** Viewer profile under which checkup is queried or recorded: determines `origin` and response shape. */
export type CheckupViewer = 'CAREGIVER' | 'PROFESSIONAL';

export type CheckupView = CheckupResponse | CaregiverCheckupResponse;

export interface CheckupWriteResult {
  checkup: CheckupView;
  /** `true` if checkup was created in this call; `false` if idempotent resend returned existing. */
  created: boolean;
}

type CheckupRow = Prisma.CheckupGetPayload<{ include: { results: true } }>;

const round2 = (v: number): number => Math.round(v * 100) / 100;

function mapPosition(position: string): MeasurementPosition {
  return position === 'RECUMBENT' ? 'recumbent' : 'standing';
}

function formatCheckupResponse(
  row: CheckupRow,
  isCurrent: boolean,
  viewer: CheckupViewer,
): CheckupView {
  const base = {
    id: row.id,
    childId: row.childId,
    measuredAt: row.measuredAt.toISOString(),
    weightKg: Number(row.weightKg),
    lengthHeightCm: Number(row.lengthHeightCm),
    position: row.position,
    origin: row.origin,
    recordedById: row.recordedById,
    correctedCheckupId: row.correctedCheckupId,
    isCurrent,
    createdAt: row.createdAt.toISOString(),
  };

  // Caregivers never receive z-scores, percentiles, or technical classifications (RF-14).
  if (viewer === 'CAREGIVER') {
    return base;
  }

  return {
    ...base,
    results: row.results.map((r) => ({
      id: r.id,
      checkupId: r.checkupId,
      indicator: r.indicator,
      zScore: Number(r.zScore),
      percentile: Number(r.percentile),
      classification: r.classification as IndicatorResult['classification'],
      referenceVersion: r.referenceVersion,
    })),
  };
}

/**
 * Computes the 4 WHO indicators for a checkup.
 * - WFA, LHFA, and BFA use completed age in months at checkup date.
 * - LHFA is adjusted +/-0.7 cm if position does not match table reference (<24 months recumbent).
 * - WFLH uses the table matching measured position; rounded to 0.5 cm.
 */
export function computeIndicatorResults(params: {
  sex: 'FEMALE' | 'MALE';
  birthDate: Date;
  measuredAt: Date;
  weightKg: number;
  lengthHeightCm: number;
  position: string;
}) {
  const { sex, birthDate, measuredAt, weightKg, lengthHeightCm } = params;
  const position = mapPosition(params.position);

  try {
    const ageMonths = ageInMonths(birthDate, measuredAt);
    const z = (ind: WhoIndicator, x: number, value: number, pos?: MeasurementPosition): number => {
      const { l, m, s } = getLmsParameters(ind, sex, x, pos);
      return round2(calculateZScore(value, l, m, s));
    };

    const tableLhfa: MeasurementPosition = ageMonths < 24 ? 'recumbent' : 'standing';
    const lhfaValue = adjustLengthHeight(lengthHeightCm, position, tableLhfa);
    const wflX = Math.round(lengthHeightCm * 2) / 2;
    const bmi = weightKg / (lengthHeightCm / 100) ** 2;

    const zs = {
      WEIGHT_FOR_AGE: z('WEIGHT_FOR_AGE', ageMonths, weightKg),
      LENGTH_HEIGHT_FOR_AGE: z('LENGTH_HEIGHT_FOR_AGE', ageMonths, lhfaValue),
      WEIGHT_FOR_LENGTH_HEIGHT: z('WEIGHT_FOR_LENGTH_HEIGHT', wflX, weightKg, position),
      BMI_FOR_AGE: z('BMI_FOR_AGE', ageMonths, bmi),
    } as const;

    const classOf = {
      WEIGHT_FOR_AGE: classify({ zWFA: zs.WEIGHT_FOR_AGE }).primary,
      LENGTH_HEIGHT_FOR_AGE: classify({ zLHFA: zs.LENGTH_HEIGHT_FOR_AGE }).primary,
      WEIGHT_FOR_LENGTH_HEIGHT: classify({ zWFLH: zs.WEIGHT_FOR_LENGTH_HEIGHT }).primary,
      BMI_FOR_AGE: classify({ zBFA: zs.BMI_FOR_AGE }).primary,
    } as const;

    return (Object.keys(zs) as (keyof typeof zs)[]).map((indicator) => ({
      id: crypto.randomUUID(),
      indicator,
      zScore: zs[indicator],
      percentile: round2(percentileFromZScore(zs[indicator])),
      classification: classOf[indicator],
      referenceVersion: WHO_REFERENCE_VERSION,
    }));
  } catch (err) {
    if (err instanceof RangeError) {
      throw HttpError.badRequest(
        'La medida está fuera del rango cubierto por los patrones de referencia de la OMS',
      );
    }
    throw err;
  }
}

/** Translates database constraint errors (duplicate PK, triggers) to 4xx HTTP responses. */
function mapCheckupDbError(err: unknown): never {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (code === 'P2002') {
      throw HttpError.conflict('Ya existe un control con ese identificador');
    }
  }
  const message = err instanceof Error ? err.message : '';
  if (/measured_at precedes/i.test(message)) {
    throw HttpError.badRequest('La fecha del control no puede ser anterior al nacimiento');
  }
  if (/without active consent/i.test(message)) {
    throw HttpError.forbidden(
      'El niño no cuenta con un consentimiento informado vigente para registrar datos',
    );
  }
  throw err;
}

function assertMeasuredAtNotFuture(measuredAt: Date): void {
  if (measuredAt.getTime() > Date.now()) {
    throw HttpError.badRequest('La fecha del control no puede estar en el futuro');
  }
}

/** A checkup is current if no other checkup corrects it. */
async function isCheckupCurrent(tx: Prisma.TransactionClient, checkupId: string): Promise<boolean> {
  const correction = await tx.checkup.findFirst({
    where: { correctedCheckupId: checkupId },
    select: { id: true },
  });
  return correction === null;
}

/**
 * Inserts checkup and its 4 computed indicator results after validating consent, WHO age, and date.
 * Idempotent by client-generated `id`: resending the same id returns the existing checkup.
 */
async function insertCheckup(
  tx: Prisma.TransactionClient,
  params: {
    auth: AuthContext;
    viewer: CheckupViewer;
    childId: string;
    input: CreateCheckupInput | CorrectCheckupInput;
    correctedCheckupId: string | null;
  },
): Promise<CheckupWriteResult> {
  const { auth, viewer, childId, input, correctedCheckupId } = params;

  const existing = await tx.checkup.findUnique({
    where: { id: input.id },
    include: { results: true },
  });
  if (existing) {
    if (existing.childId !== childId || existing.correctedCheckupId !== correctedCheckupId) {
      throw HttpError.conflict('Ya existe un control con ese identificador');
    }
    return {
      checkup: formatCheckupResponse(existing, await isCheckupCurrent(tx, existing.id), viewer),
      created: false,
    };
  }

  await assertActiveConsent(tx, childId);

  const child = await tx.child.findUnique({
    where: { id: childId },
    select: { birthDate: true, sex: true },
  });
  if (!child) {
    throw HttpError.notFound('Niño no encontrado');
  }

  const measuredAt = new Date(input.measuredAt);
  assertMeasuredAtNotFuture(measuredAt);
  if (measuredAt < child.birthDate) {
    throw HttpError.badRequest('La fecha del control no puede ser anterior al nacimiento');
  }
  assertChildAgeInOmsRange(child.birthDate, measuredAt);

  const results = computeIndicatorResults({
    sex: child.sex,
    birthDate: child.birthDate,
    measuredAt,
    weightKg: input.weightKg,
    lengthHeightCm: input.lengthHeightCm,
    position: input.position,
  });

  try {
    const created = await tx.checkup.create({
      data: {
        id: input.id,
        childId,
        measuredAt,
        weightKg: input.weightKg,
        lengthHeightCm: input.lengthHeightCm,
        position: input.position,
        origin: viewer,
        recordedById: auth.userId,
        correctedCheckupId,
        results: {
          create: results,
        },
      },
      include: { results: true },
    });
    return { checkup: formatCheckupResponse(created, true, viewer), created: true };
  } catch (err) {
    return mapCheckupDbError(err);
  }
}

/** Records a new checkup for a child (RF-04, RF-05). */
export async function createCheckup(
  auth: AuthContext,
  viewer: CheckupViewer,
  childId: string,
  input: CreateCheckupInput,
): Promise<CheckupWriteResult> {
  return withUser(auth.userId, (tx) =>
    insertCheckup(tx, { auth, viewer, childId, input, correctedCheckupId: null }),
  );
}

/**
 * Retrieves the child to which a checkup belongs. RLS conceals unlinked children,
 * returning 404 for unlinked or non-existent checkups identically.
 */
export async function getCheckupChildId(auth: AuthContext, checkupId: string): Promise<string> {
  const checkup = await withUser(auth.userId, (tx) =>
    tx.checkup.findUnique({ where: { id: checkupId }, select: { childId: true } }),
  );
  if (!checkup) {
    throw HttpError.notFound('Control no encontrado');
  }
  return checkup.childId;
}

/**
 * Corrects a checkup: checkups are never edited or deleted; a new checkup pointing to
 * original with `correctedCheckupId` is created. Original retains its results and alerts,
 * but ceases to be current. Only current checkups may be corrected (linear chains).
 */
export async function correctCheckup(
  auth: AuthContext,
  viewer: CheckupViewer,
  checkupId: string,
  input: CorrectCheckupInput,
): Promise<CheckupWriteResult> {
  return withUser(auth.userId, async (tx) => {
    const original = await tx.checkup.findUnique({
      where: { id: checkupId },
      select: { id: true, childId: true },
    });
    if (!original) {
      throw HttpError.notFound('Control no encontrado');
    }

    const replacement = await tx.checkup.findFirst({
      where: { correctedCheckupId: checkupId },
      select: { id: true },
    });
    // Idempotent retry of same correction: handled in insertCheckup.
    if (replacement && replacement.id !== input.id) {
      throw HttpError.conflict('Este control ya fue corregido; corrige el control vigente');
    }

    return insertCheckup(tx, {
      auth,
      viewer,
      childId: original.childId,
      input,
      correctedCheckupId: checkupId,
    });
  });
}

/**
 * Complete checkup history of child (including superseded checkups), in descending measuredAt order.
 * `onlyCurrent` returns only active checkups (used by charts and alerts).
 */
export async function listChildCheckups(
  auth: AuthContext,
  viewer: CheckupViewer,
  childId: string,
  onlyCurrent = false,
): Promise<CheckupView[]> {
  return withUser(auth.userId, async (tx) => {
    const rows = await tx.checkup.findMany({
      where: { childId },
      include: { results: true },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });

    const superseded = new Set(
      rows.map((r) => r.correctedCheckupId).filter((id): id is string => id !== null),
    );

    return rows
      .map((row) => formatCheckupResponse(row, !superseded.has(row.id), viewer))
      .filter((c) => !onlyCurrent || c.isCurrent);
  });
}
