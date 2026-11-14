import type { CurvePoint } from '@nutrikids/shared';
import { describe, expect, it } from 'vitest';
import {
  INDICATORS,
  axisTicks,
  bodyMassIndex,
  checkupToPoint,
  checkupsToPoints,
  clipSeries,
  computeDomain,
  curvesPositionFor,
  downsample,
  interpolateAt,
  latestCheckup,
  projectPoint,
  toDashedSegments,
  toSegments,
} from '../lib/growth-chart.js';

const BIRTH_DATE = '2023-06-15';

const indicator = (key: string) => INDICATORS.find((item) => item.key === key)!;

const makeCheckup = (measuredAt: string, weightKg: number, lengthHeightCm: number) => ({
  id: measuredAt,
  childId: 'c',
  measuredAt,
  weightKg,
  lengthHeightCm,
  position: 'STANDING' as const,
  origin: 'CAREGIVER' as const,
  recordedById: 'u',
  correctedCheckupId: null,
  isCurrent: true,
  notes: null,
  createdAt: measuredAt,
});

/** Linear series over 0..60 months: y = base + slope * x. */
const line = (base: number, slope: number): CurvePoint[] =>
  Array.from({ length: 61 }, (_, x) => ({ x, y: base + slope * x }));

const curves = {
  '-3': line(6, 0.1),
  '-2': line(7, 0.12),
  '0': line(9, 0.16),
  '+2': line(11, 0.2),
  '+3': line(12, 0.24),
};

describe('growth-chart points', () => {
  it('maps each indicator to its axes (age or length/height on X)', () => {
    // 12 months and 25 days after the birth date → 28 months.
    const checkup = makeCheckup('2025-10-20T15:00:00.000Z', 12, 90);

    expect(checkupToPoint(indicator('PE'), checkup, BIRTH_DATE)).toEqual({ x: 28, y: 12 });
    expect(checkupToPoint(indicator('TE'), checkup, BIRTH_DATE)).toEqual({ x: 28, y: 90 });
    expect(checkupToPoint(indicator('PT'), checkup, BIRTH_DATE)).toEqual({ x: 90, y: 12 });
    const imc = checkupToPoint(indicator('IMCE'), checkup, BIRTH_DATE);
    expect(imc.x).toBe(28);
    expect(imc.y).toBeCloseTo(bodyMassIndex(12, 90), 6);
    expect(bodyMassIndex(12, 90)).toBeCloseTo(14.81, 2);
  });

  it('orders the points along the X axis', () => {
    const points = checkupsToPoints(
      indicator('PE'),
      [
        makeCheckup('2026-11-10T12:00:00.000Z', 13.4, 91.5),
        makeCheckup('2025-05-10T12:00:00.000Z', 10.2, 82),
      ],
      BIRTH_DATE,
    );

    expect(points.map((point) => point.y)).toEqual([10.2, 13.4]);
  });

  it('finds the latest checkup', () => {
    const checkups = [
      makeCheckup('2026-01-10T12:00:00.000Z', 12, 90),
      makeCheckup('2026-11-10T12:00:00.000Z', 13, 92),
      makeCheckup('2026-05-10T12:00:00.000Z', 12.5, 91),
    ];

    expect(latestCheckup(checkups)?.weightKg).toBe(13);
    expect(latestCheckup([])).toBeUndefined();
  });

  it('only requests a position for weight-for-length/height', () => {
    const latest = { position: 'RECUMBENT' as const };

    expect(curvesPositionFor(indicator('PT'), latest)).toBe('RECUMBENT');
    expect(curvesPositionFor(indicator('PE'), latest)).toBeUndefined();
    expect(curvesPositionFor(indicator('PT'), undefined)).toBeUndefined();
  });
});

describe('growth-chart curves', () => {
  it('interpolates inside a series and clamps outside it', () => {
    const series = [
      { x: 10, y: 100 },
      { x: 20, y: 200 },
    ];

    expect(interpolateAt(series, 15)).toBe(150);
    expect(interpolateAt(series, 5)).toBe(100);
    expect(interpolateAt(series, 30)).toBe(200);
    expect(interpolateAt([], 1)).toBeNaN();
  });

  it('clips a series to a window with interpolated edges', () => {
    const clipped = clipSeries(line(0, 1), 10.5, 13.5);

    expect(clipped.map((point) => point.x)).toEqual([10.5, 11, 12, 13, 13.5]);
    expect(clipped[0]!.y).toBeCloseTo(10.5);
    expect(clipped[clipped.length - 1]!.y).toBeCloseTo(13.5);
  });

  it('downsamples long series keeping both ends', () => {
    const series = line(0, 1);
    const reduced = downsample(series, 10);

    expect(reduced).toHaveLength(10);
    expect(reduced[0]).toEqual(series[0]);
    expect(reduced[9]).toEqual(series[60]);
    expect(downsample(series.slice(0, 5), 10)).toHaveLength(5);
  });
});

describe('growth-chart domain and projection', () => {
  it('centers the window on the child data with a minimum span of 12 months', () => {
    const domain = computeDomain(curves, [{ x: 30, y: 12 }], 'age')!;

    expect(domain.xMin).toBe(24);
    expect(domain.xMax).toBe(36);
  });

  it('widens the window to fit several points and stays inside the reference table', () => {
    const domain = computeDomain(
      curves,
      [
        { x: 14, y: 10 },
        { x: 58, y: 16 },
      ],
      'age',
    )!;

    expect(domain.xMin).toBeGreaterThanOrEqual(0);
    expect(domain.xMax).toBeLessThanOrEqual(60);
    expect(domain.xMin).toBeLessThan(14);
    expect(domain.xMax).toBeGreaterThan(58);
  });

  it('uses a 10 cm minimum span for weight-for-length/height', () => {
    const domain = computeDomain(curves, [{ x: 30, y: 12 }], 'height')!;

    expect(domain.xMax - domain.xMin).toBe(10);
  });

  it('fits the vertical range to the -2 / +2 curves and the child points', () => {
    const outlier = computeDomain(curves, [{ x: 30, y: 30 }], 'age')!;
    const inside = computeDomain(curves, [{ x: 30, y: 12 }], 'age')!;

    expect(inside.yMin).toBeLessThan(curves['-2'][24]!.y);
    expect(inside.yMax).toBeGreaterThan(curves['+2'][36]!.y);
    expect(outlier.yMax).toBeGreaterThan(30);
  });

  it('returns null when there is nothing to draw', () => {
    expect(computeDomain(curves, [], 'age')).toBeNull();
    expect(computeDomain({ ...curves, '0': [] }, [{ x: 30, y: 12 }], 'age')).toBeNull();
  });

  it('projects points into the plot (Y grows upwards)', () => {
    const domain = { xMin: 0, xMax: 10, yMin: 0, yMax: 20 };

    expect(projectPoint({ x: 0, y: 0 }, domain, 200, 100)).toEqual({ left: 0, top: 100 });
    expect(projectPoint({ x: 10, y: 20 }, domain, 200, 100)).toEqual({ left: 200, top: 0 });
    expect(projectPoint({ x: 5, y: 10 }, domain, 200, 100)).toEqual({ left: 100, top: 50 });
  });

  it('builds rotated segments between consecutive pixel points', () => {
    const [flat, diagonal] = toSegments([
      { left: 0, top: 10 },
      { left: 10, top: 10 },
      { left: 10, top: 20 },
    ]);

    expect(flat).toEqual({ centerX: 5, centerY: 10, length: 10, angle: 0 });
    expect(diagonal).toEqual({ centerX: 10, centerY: 15, length: 10, angle: 90 });
    expect(toSegments([{ left: 0, top: 0 }])).toEqual([]);
  });

  it('builds dashed segments with gaps along a polyline', () => {
    const dashes = toDashedSegments(
      [
        { left: 0, top: 10 },
        { left: 20, top: 10 },
      ],
      5,
      4,
    );

    expect(dashes).toEqual([
      { centerX: 2.5, centerY: 10, length: 5, angle: 0 },
      { centerX: 11.5, centerY: 10, length: 5, angle: 0 },
      { centerX: 19, centerY: 10, length: 2, angle: 0 },
    ]);
    expect(toDashedSegments([{ left: 0, top: 0 }])).toEqual([]);
  });

  it('creates evenly spaced rounded axis ticks', () => {
    expect(axisTicks({ xMin: 24, xMax: 36, yMin: 0, yMax: 1 })).toEqual([24, 30, 36]);
    expect(axisTicks({ xMin: 90.4, xMax: 100.6, yMin: 0, yMax: 1 })).toEqual([90, 96, 101]);
  });
});
