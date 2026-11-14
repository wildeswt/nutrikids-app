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

/** Chart points of the child, ordered along the X axis (the API returns newest first). */
export function checkupsToPoints(
  indicator: IndicatorInfo,
  checkups: readonly CaregiverCheckupResponse[],
  birthDate: string,
): CurvePoint[] {
  return checkups
    .map((checkup) => checkupToPoint(indicator, checkup, birthDate))
    .sort((a, b) => a.x - b.x);
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
 * outside the reference table), with the vertical range taken from the -2 / +2 curves in that
 * window and the child's points. Returns `null` when there is nothing to draw.
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

  const lower = clipSeries(curves['-2'], xMin, xMax);
  const upper = clipSeries(curves['+2'], xMin, xMax);
  const ys = [...lower, ...upper, ...points].map((point) => point.y);
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const padding = (rawMax - rawMin) * 0.08 || 1;

  return { xMin, xMax, yMin: rawMin - padding, yMax: rawMax + padding };
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

/** Evenly spaced X axis values (rounded) for the labels below the plot. */
export function axisTicks(domain: ChartDomain, count = 3): number[] {
  return Array.from({ length: count }, (_, index) =>
    Math.round(domain.xMin + ((domain.xMax - domain.xMin) * index) / (count - 1)),
  );
}
