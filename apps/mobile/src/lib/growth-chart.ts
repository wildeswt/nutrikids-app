import {
  completedMonths,
  type CaregiverCheckupResponse,
  type CurvePoint,
  type Indicator,
  type Position,
  type ReferenceCurvesResponse,
} from '@nutrikids/shared';

/** Indicator keys of the evolution screen: P/E, T/E, P/T and IMC/E. */
export type IndicatorKey = 'PE' | 'TE' | 'PT' | 'IMCE';

export interface IndicatorInfo {
  key: IndicatorKey;
  indicator: Indicator;
  /** X axis: age in months, or length/height in cm for weight-for-length/height. */
  xAxis: 'age' | 'height';
}

export const INDICATORS: readonly IndicatorInfo[] = [
  { key: 'PE', indicator: 'WEIGHT_FOR_AGE', xAxis: 'age' },
  { key: 'TE', indicator: 'LENGTH_HEIGHT_FOR_AGE', xAxis: 'age' },
  { key: 'PT', indicator: 'WEIGHT_FOR_LENGTH_HEIGHT', xAxis: 'height' },
  { key: 'IMCE', indicator: 'BMI_FOR_AGE', xAxis: 'age' },
];

/** Narrowest window shown on the X axis, so a single checkup is not stretched across it. */
const MIN_X_SPAN: Record<IndicatorInfo['xAxis'], number> = { age: 12, height: 10 };

/** Upper bound of curve samples drawn per series (each sample costs a few views). */
const MAX_SAMPLES = 40;

type Curves = ReferenceCurvesResponse['curves'];

export function bodyMassIndex(weightKg: number, lengthHeightCm: number): number {
  const meters = lengthHeightCm / 100;
  return weightKg / (meters * meters);
}

export interface ChartCheckupPoint<
  T extends Pick<CaregiverCheckupResponse, 'id' | 'measuredAt' | 'weightKg' | 'lengthHeightCm'> =
    CaregiverCheckupResponse,
> extends CurvePoint {
  checkupId: string;
  checkup: T;
}

/** Where a checkup lands on the chart of an indicator. */
export function checkupToPoint(
  indicator: IndicatorInfo,
  checkup: Pick<CaregiverCheckupResponse, 'measuredAt' | 'weightKg' | 'lengthHeightCm'>,
  birthDate: string,
): CurvePoint {
  const ageMonths = completedMonths(birthDate, checkup.measuredAt.slice(0, 10));
  switch (indicator.key) {
    case 'PE':
      return { x: ageMonths, y: checkup.weightKg };
    case 'TE':
      return { x: ageMonths, y: checkup.lengthHeightCm };
    case 'PT':
      return { x: checkup.lengthHeightCm, y: checkup.weightKg };
    case 'IMCE':
      return { x: ageMonths, y: bodyMassIndex(checkup.weightKg, checkup.lengthHeightCm) };
  }
}

/** Chart points of the child with their source checkup, ordered along the X axis (oldest first). */
export function checkupsToPoints<
  T extends Pick<CaregiverCheckupResponse, 'id' | 'measuredAt' | 'weightKg' | 'lengthHeightCm'>,
>(indicator: IndicatorInfo, checkups: readonly T[], birthDate: string): ChartCheckupPoint<T>[] {
  return checkups
    .map((checkup) => ({
      ...checkupToPoint(indicator, checkup, birthDate),
      checkupId: checkup.id,
      checkup,
    }))
    .sort((a, b) => a.x - b.x || a.checkup.measuredAt.localeCompare(b.checkup.measuredAt));
}

/** The checkup with the latest measurement date. */
export function latestCheckup(
  checkups: readonly CaregiverCheckupResponse[],
): CaregiverCheckupResponse | undefined {
  return checkups.reduce<CaregiverCheckupResponse | undefined>(
    (latest, checkup) =>
      !latest || checkup.measuredAt.localeCompare(latest.measuredAt) > 0 ? checkup : latest,
    undefined,
  );
}

/**
 * Position sent to `/reference/curves`: only weight-for-length/height uses it, taken from the
 * most recent checkup (recumbent → length table, standing → height table).
 */
export function curvesPositionFor(
  indicator: IndicatorInfo,
  latest: Pick<CaregiverCheckupResponse, 'position'> | undefined,
): Position | undefined {
  return indicator.key === 'PT' ? latest?.position : undefined;
}

export interface ChartDomain {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Linear interpolation of a series at `x` (clamped to the series ends). */
export function interpolateAt(series: readonly CurvePoint[], x: number): number {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return Number.NaN;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;

  const upperIndex = series.findIndex((point) => point.x >= x);
  const upper = series[upperIndex]!;
  const lower = series[upperIndex - 1]!;
  if (upper.x === lower.x) return upper.y;
  return lower.y + ((upper.y - lower.y) * (x - lower.x)) / (upper.x - lower.x);
}

/** Part of a series inside `[xMin, xMax]`, with interpolated points on both edges. */
export function clipSeries(
  series: readonly CurvePoint[],
  xMin: number,
  xMax: number,
): CurvePoint[] {
  if (series.length === 0) return [];
  const inside = series.filter((point) => point.x > xMin && point.x < xMax);
  return [
    { x: xMin, y: interpolateAt(series, xMin) },
    ...inside,
    { x: xMax, y: interpolateAt(series, xMax) },
  ];
}

/** Keeps at most `limit` points, always including the first and last. */
export function downsample(series: readonly CurvePoint[], limit = MAX_SAMPLES): CurvePoint[] {
  if (series.length <= limit) return [...series];
  const step = (series.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => series[Math.round(index * step)]!);
}

/**
 * Window of the chart: around the child's points (never narrower than the minimum span and never
 * outside the reference table), with the vertical range taken from all 5 WHO curves (-3, -2, 0,
 * +2, +3) in that window and the child's points. Returns `null` when there is nothing to draw.
 */
export function computeDomain(
  curves: Curves,
  points: readonly CurvePoint[],
  xAxis: IndicatorInfo['xAxis'],
): ChartDomain | null {
  const median = curves['0'];
  const tableMin = median[0]?.x;
  const tableMax = median[median.length - 1]?.x;
  if (points.length === 0 || tableMin === undefined || tableMax === undefined) return null;

  const xs = points.map((point) => point.x);
  const low = Math.min(...xs);
  const high = Math.max(...xs);
  const center = (low + high) / 2;
  const half = Math.max(((high - low) / 2) * 1.3, MIN_X_SPAN[xAxis] / 2);

  const xMin = Math.max(center - half, tableMin);
  const xMax = Math.min(center + half, tableMax);
  if (xMax <= xMin) return null;

  const lower3 = clipSeries(curves['-3'], xMin, xMax);
  const lower2 = clipSeries(curves['-2'], xMin, xMax);
  const upper2 = clipSeries(curves['+2'], xMin, xMax);
  const upper3 = clipSeries(curves['+3'], xMin, xMax);
  const ys = [...lower3, ...lower2, ...upper2, ...upper3, ...points].map((point) => point.y);
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const padding = (rawMax - rawMin) * 0.08 || 1;

  return { xMin, xMax, yMin: rawMin - padding, yMax: rawMax + padding };
}

export interface ChartZonePositions {
  /** Vertical center (px) of the zone between +2 and +3. */
  upperZoneTop: number;
  /** Vertical center (px) of the zone between -2 and +2. */
  normalZoneTop: number;
  /** Vertical center (px) of the zone between -2 and -3. */
  lowerZoneTop: number;
  /** Vertical position (px) at the right edge (xMax) for each of the 5 curves. */
  curveRightTops: Record<'-3' | '-2' | '0' | '+2' | '+3', number>;
}

/**
 * Vertical pixel positions for the zone labels between the WHO curves and for the 5 curve ends.
 */
export function computeZonePositions(
  curves: Curves,
  domain: ChartDomain,
  plotHeight: number,
): ChartZonePositions {
  const xMid = (domain.xMin + domain.xMax) / 2;
  const yToTop = (y: number) =>
    plotHeight - ((y - domain.yMin) / (domain.yMax - domain.yMin)) * plotHeight;

  const midPlus3 = interpolateAt(curves['+3'], xMid);
  const midPlus2 = interpolateAt(curves['+2'], xMid);
  const midZero = interpolateAt(curves['0'], xMid);
  const midMinus2 = interpolateAt(curves['-2'], xMid);
  const midMinus3 = interpolateAt(curves['-3'], xMid);

  return {
    upperZoneTop: yToTop((midPlus3 + midPlus2) / 2),
    normalZoneTop: yToTop(midZero),
    lowerZoneTop: yToTop((midMinus2 + midMinus3) / 2),
    curveRightTops: {
      '+3': yToTop(interpolateAt(curves['+3'], domain.xMax)),
      '+2': yToTop(interpolateAt(curves['+2'], domain.xMax)),
      '0': yToTop(interpolateAt(curves['0'], domain.xMax)),
      '-2': yToTop(interpolateAt(curves['-2'], domain.xMax)),
      '-3': yToTop(interpolateAt(curves['-3'], domain.xMax)),
    },
  };
}

export interface PixelPoint {
  left: number;
  top: number;
}

/** Position of a data point inside a plot of `width` x `height` px (Y grows upwards in data). */
export function projectPoint(
  point: CurvePoint,
  domain: ChartDomain,
  width: number,
  height: number,
): PixelPoint {
  return {
    left: ((point.x - domain.xMin) / (domain.xMax - domain.xMin)) * width,
    top: height - ((point.y - domain.yMin) / (domain.yMax - domain.yMin)) * height,
  };
}

export interface LineSegment {
  /** Center of the segment. */
  centerX: number;
  centerY: number;
  length: number;
  /** Rotation in degrees. */
  angle: number;
}

/** Straight segments joining consecutive pixel points (a line made of rotated views). */
export function toSegments(points: readonly PixelPoint[]): LineSegment[] {
  const segments: LineSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    segments.push({
      centerX: (from.left + to.left) / 2,
      centerY: (from.top + to.top) / 2,
      length: Math.hypot(dx, dy),
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return segments;
}

/** Dashed segments along a polyline with consistent dash and gap lengths in pixels. */
export function toDashedSegments(
  points: readonly PixelPoint[],
  dashLength = 5,
  gapLength = 4,
): LineSegment[] {
  const segments: LineSegment[] = [];
  const cycle = dashLength + gapLength;
  let phase = 0;

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;

    const ux = dx / segLen;
    const uy = dy / segLen;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    let pos = 0;

    while (pos < segLen) {
      if (phase < dashLength) {
        const step = Math.min(dashLength - phase, segLen - pos);
        const mid = pos + step / 2;
        segments.push({
          centerX: from.left + ux * mid,
          centerY: from.top + uy * mid,
          length: step,
          angle,
        });
        pos += step;
        phase = (phase + step) % cycle;
      } else {
        const step = Math.min(cycle - phase, segLen - pos);
        pos += step;
        phase = (phase + step) % cycle;
      }
    }
  }

  return segments;
}

/** Evenly spaced X axis values (rounded) for the labels below the plot. */
export function axisTicks(domain: ChartDomain, count = 3): number[] {
  return Array.from({ length: count }, (_, index) =>
    Math.round(domain.xMin + ((domain.xMax - domain.xMin) * index) / (count - 1)),
  );
}
