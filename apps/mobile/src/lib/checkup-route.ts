import type { CaregiverCheckupResponse, ChildResponse, Position } from '@nutrikids/shared';
import { PositionSchema } from '@nutrikids/shared';
import type { LocalWhoEvaluation } from './checkup-form.js';

export type CheckupRoleMode = 'CAREGIVER' | 'PROFESSIONAL';

/**
 * Route params of `checkup-saved`. Router params are strings, so the checkup returned by the API
 * is flattened here and rebuilt by `parseCheckupSavedParams`.
 */
export interface CheckupSavedParams extends Record<string, string> {
  childId: string;
  childName: string;
  birthDate: string;
  measuredAt: string;
  weightKg: string;
  lengthHeightCm: string;
  position: string;
}

export interface SavedCheckupView {
  childId: string;
  /** Child first name. */
  childName: string;
  birthDate: string;
  measuredAt: string;
  weightKg: number;
  lengthHeightCm: number;
  position: Position;
  pendingSync?: boolean;
  localEvaluation?: LocalWhoEvaluation | null;
  roleMode?: CheckupRoleMode;
}

export function toCheckupSavedParams(
  child: Pick<ChildResponse, 'id' | 'firstName' | 'birthDate'>,
  checkup: Pick<
    CaregiverCheckupResponse,
    'measuredAt' | 'weightKg' | 'lengthHeightCm' | 'position'
  > & { savedLocally?: boolean; localOnly?: boolean },
  extra?: {
    localEvaluation?: LocalWhoEvaluation | null;
    roleMode?: CheckupRoleMode;
  },
): CheckupSavedParams {
  const isPendingSync = Boolean(checkup.savedLocally || checkup.localOnly);
  const params: CheckupSavedParams = {
    childId: child.id,
    childName: child.firstName,
    birthDate: child.birthDate,
    measuredAt: checkup.measuredAt,
    weightKg: String(checkup.weightKg),
    lengthHeightCm: String(checkup.lengthHeightCm),
    position: checkup.position,
  };
  if (isPendingSync) {
    params.pendingSync = '1';
  }
  if (extra?.localEvaluation) {
    params.localEvaluation = JSON.stringify(extra.localEvaluation);
  }
  if (extra?.roleMode) {
    params.roleMode = extra.roleMode;
  }
  return params;
}

type RawParams = Partial<Record<keyof CheckupSavedParams, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Rebuilds the saved checkup from route params; `null` if the screen was opened without them. */
export function parseCheckupSavedParams(params: RawParams): SavedCheckupView | null {
  const childId = single(params.childId);
  const measuredAt = single(params.measuredAt);
  const birthDate = single(params.birthDate);
  const weightKg = Number(single(params.weightKg));
  const lengthHeightCm = Number(single(params.lengthHeightCm));
  const position = PositionSchema.safeParse(single(params.position));

  if (
    !childId ||
    !measuredAt ||
    !birthDate ||
    !Number.isFinite(weightKg) ||
    !Number.isFinite(lengthHeightCm) ||
    !position.success
  ) {
    return null;
  }

  const pendingSync = single(params.pendingSync) === '1';
  const rawEval = single(params.localEvaluation);
  let localEvaluation: LocalWhoEvaluation | null = null;
  if (rawEval) {
    try {
      const parsed = JSON.parse(rawEval) as LocalWhoEvaluation;
      if (parsed && Array.isArray(parsed.results)) {
        localEvaluation = parsed;
      }
    } catch {
      localEvaluation = null;
    }
  }
  const rawRole = single(params.roleMode);
  const roleMode: CheckupRoleMode | undefined =
    rawRole === 'PROFESSIONAL' || rawRole === 'CAREGIVER' ? rawRole : undefined;

  return {
    childId,
    childName: single(params.childName) ?? '',
    birthDate,
    measuredAt,
    weightKg,
    lengthHeightCm,
    position: position.data,
    ...(pendingSync ? { pendingSync: true } : {}),
    ...(localEvaluation ? { localEvaluation } : {}),
    ...(roleMode ? { roleMode } : {}),
  };
}
