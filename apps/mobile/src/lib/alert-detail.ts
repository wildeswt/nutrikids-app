import type { CheckupResponse, Indicator } from '@nutrikids/shared';

/** Width (dp) from which the detail uses two columns (tablets). */
export const WIDE_LAYOUT_MIN_WIDTH = 768;

export function isWideLayout(width: number): boolean {
  return width >= WIDE_LAYOUT_MIN_WIDTH;
}

/** One checkup of the child on the z-score chart of the alert's indicator. */
export interface ZPoint {
  checkupId: string;
  measuredAt: string;
  z: number;
  /** The checkup that raised the alert (highlighted on the chart). */
  isAlert: boolean;
}

/**
 * z-score of `indicator` at each checkup, oldest first. Only current checkups are plotted, plus
 * the one that raised the alert even when it was corrected later (the alert stays open).
 */
export function zSeriesFor(
  checkups: readonly CheckupResponse[],
  indicator: Indicator,
  alertCheckupId: string,
): ZPoint[] {
  const points: ZPoint[] = [];
  for (const checkup of checkups) {
    if (!checkup.isCurrent && checkup.id !== alertCheckupId) continue;
    const result = checkup.results.find((r) => r.indicator === indicator);
    if (!result) continue;
    points.push({
      checkupId: checkup.id,
      measuredAt: checkup.measuredAt,
      z: result.zScore,
      isAlert: checkup.id === alertCheckupId,
    });
  }
  return points.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}

export type ZResult =
  { kind: 'below'; limit: 2 | 3 } | { kind: 'above'; limit: 2 | 3 } | { kind: 'value' };

/** How far the z-score is from the normal band (−2 to +2): "below −2", "above +3", ... */
export function describeZResult(z: number): ZResult {
  if (z < -3) return { kind: 'below', limit: 3 };
  if (z < -2) return { kind: 'below', limit: 2 };
  if (z > 3) return { kind: 'above', limit: 3 };
  if (z > 2) return { kind: 'above', limit: 2 };
  return { kind: 'value' };
}

/** Vertical range of the z chart: ±3 plus room so a point on ±3 is not cut by the border. */
export const Z_CHART_LIMIT = 3.5;

/** Tick values drawn on the Y axis, top to bottom. */
export const Z_TICKS = [3, 2, 0, -2, -3] as const;

/** Keeps a z-score inside the drawable range (an extreme value sits on the edge). */
export function clampZ(z: number): number {
  return Math.max(-Z_CHART_LIMIT, Math.min(Z_CHART_LIMIT, z));
}

/**
 * Horizontal position (0..1) of each point by date. One point is centered; the points are padded
 * from the edges so the dots do not touch them.
 */
export function xPositions(points: readonly ZPoint[]): number[] {
  if (points.length === 0) return [];
  const times = points.map((p) => Date.parse(p.measuredAt));
  const min = Math.min(...times);
  const span = Math.max(...times) - min;
  if (span === 0) return points.map(() => 0.5);
  return times.map((time) => 0.06 + ((time - min) / span) * 0.88);
}

/** Vertical position (0 = top, 1 = bottom) of a z-score. */
export function yPosition(z: number): number {
  return (Z_CHART_LIMIT - clampZ(z)) / (2 * Z_CHART_LIMIT);
}
