import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dateLabelIndexes, ZScoreChart } from '../components/ZScoreChart.js';
import {
  clampZ,
  describeZResult,
  isWideLayout,
  xPositions,
  yPosition,
  zSeriesFor,
  Z_CHART_LIMIT,
  type ZPoint,
} from '../lib/alert-detail.js';
import { CHECKUP_ID, makeCheckup } from './alerts-fixtures.js';

const OTHER = '88888888-8888-4888-8888-888888888888';
const OLDER = '99999999-9999-4999-8999-999999999999';

describe('zSeriesFor', () => {
  it('returns the z-score of the indicator at each checkup, oldest first', () => {
    const series = zSeriesFor(
      [
        makeCheckup({ id: CHECKUP_ID, measuredAt: '2026-10-18T09:00:00.000Z' }, -2.2),
        makeCheckup({ id: OLDER, measuredAt: '2026-04-10T09:00:00.000Z' }, 0.1),
        makeCheckup({ id: OTHER, measuredAt: '2026-08-12T09:00:00.000Z' }, -0.3),
      ],
      'WEIGHT_FOR_AGE',
      CHECKUP_ID,
    );

    expect(series.map((p) => [p.checkupId, p.z, p.isAlert])).toEqual([
      [OLDER, 0.1, false],
      [OTHER, -0.3, false],
      [CHECKUP_ID, -2.2, true],
    ]);
  });

  it('skips corrected checkups, except the one that raised the alert', () => {
    const checkups = [
      makeCheckup({ id: CHECKUP_ID, isCurrent: false }, -2.5),
      makeCheckup({ id: OTHER, isCurrent: false, measuredAt: '2026-09-01T00:00:00.000Z' }, 0),
      makeCheckup({ id: OLDER, measuredAt: '2026-10-11T00:00:00.000Z' }, -2.4),
    ];

    const series = zSeriesFor(checkups, 'WEIGHT_FOR_AGE', CHECKUP_ID);

    expect(series.map((p) => p.checkupId)).toEqual([OLDER, CHECKUP_ID]);
  });

  it('uses only the requested indicator and ignores checkups without it', () => {
    const checkup = makeCheckup();
    const onlyLength = {
      ...checkup,
      results: checkup.results.filter((r) => r.indicator === 'LENGTH_HEIGHT_FOR_AGE'),
    };
    expect(zSeriesFor([onlyLength], 'WEIGHT_FOR_AGE', CHECKUP_ID)).toEqual([]);
    expect(zSeriesFor([onlyLength], 'LENGTH_HEIGHT_FOR_AGE', CHECKUP_ID)).toHaveLength(1);
  });
});

describe('describeZResult', () => {
  it.each([
    [-4.76, { kind: 'below', limit: 3 }],
    [-3.01, { kind: 'below', limit: 3 }],
    [-3, { kind: 'below', limit: 2 }],
    [-2.2, { kind: 'below', limit: 2 }],
    [2.4, { kind: 'above', limit: 2 }],
    [3.5, { kind: 'above', limit: 3 }],
    [-2, { kind: 'value' }],
    [1.4, { kind: 'value' }],
  ])('z = %s', (z, expected) => {
    expect(describeZResult(z)).toEqual(expected);
  });
});

describe('chart geometry', () => {
  it('maps +3.5 to the top, 0 to the middle and −3.5 to the bottom, clamping extremes', () => {
    expect(yPosition(Z_CHART_LIMIT)).toBe(0);
    expect(yPosition(0)).toBe(0.5);
    expect(yPosition(-Z_CHART_LIMIT)).toBe(1);
    expect(yPosition(-9)).toBe(1);
    expect(clampZ(8)).toBe(Z_CHART_LIMIT);
  });

  it('spreads points over time inside the plot and centers a single point', () => {
    const point = (measuredAt: string): ZPoint => ({
      checkupId: measuredAt,
      measuredAt,
      z: 0,
      isAlert: false,
    });
    const xs = xPositions([
      point('2026-01-01T00:00:00.000Z'),
      point('2026-01-11T00:00:00.000Z'),
      point('2026-01-21T00:00:00.000Z'),
    ]);
    expect(xs[0]).toBeCloseTo(0.06);
    expect(xs[1]).toBeCloseTo(0.5);
    expect(xs[2]).toBeCloseTo(0.94);
    expect(xPositions([point('2026-01-01T00:00:00.000Z')])).toEqual([0.5]);
    expect(xPositions([])).toEqual([]);
  });

  it('uses two columns from tablet width', () => {
    expect(isWideLayout(390)).toBe(false);
    expect(isWideLayout(767)).toBe(false);
    expect(isWideLayout(768)).toBe(true);
    expect(isWideLayout(1024)).toBe(true);
  });
});

describe('ZScoreChart', () => {
  const series: ZPoint[] = [
    { checkupId: 'a', measuredAt: '2026-04-10T09:00:00.000Z', z: 0.1, isAlert: false },
    { checkupId: 'b', measuredAt: '2026-08-12T09:00:00.000Z', z: -0.3, isAlert: false },
    { checkupId: 'c', measuredAt: '2026-10-18T09:00:00.000Z', z: -2.2, isAlert: true },
  ];

  it('draws the bands, dashed guides, month labels and the z label on the last point', () => {
    const html = renderToString(React.createElement(ZScoreChart, { points: series }));

    expect(html).toContain('z-chart-normal-band');
    expect(html).toContain('z-chart-risk-zone');
    expect(html).toContain('z-chart-dashed-guide');
    expect(html.match(/z-chart-point/g)).toHaveLength(2);
    expect(html).toContain('z-chart-alert-point');
    expect(html).toContain('z-chart-halo');
    expect(html).toContain('z = -2,2');
    for (const month of ['Abr', 'Ago', 'Oct']) expect(html).toContain(`>${month}<`);
    for (const tick of ['+3', '+2', '0', '−2', '−3']) expect(html).toContain(`>${tick}<`);
  });

  it('also shows the z label on the last point when a newer checkup follows the alert', () => {
    const extended: ZPoint[] = [
      ...series,
      { checkupId: 'd', measuredAt: '2026-11-18T09:00:00.000Z', z: -1.4, isAlert: false },
    ];
    const html = renderToString(React.createElement(ZScoreChart, { points: extended }));

    expect(html).toContain('z-chart-alert-label');
    expect(html).toContain('z-chart-last-label');
    expect(html).toContain('z = -1,4');
  });

  it('labels only the first, last and alert dates when there are many checkups', () => {
    const many: ZPoint[] = Array.from({ length: 8 }, (_, i) => ({
      checkupId: String(i),
      measuredAt: `2026-0${i + 1}-10T09:00:00.000Z`,
      z: 0,
      isAlert: i === 3,
    }));
    expect(dateLabelIndexes(many)).toEqual([0, 3, 7]);
    expect(dateLabelIndexes(series)).toEqual([0, 1, 2]);
  });
});
