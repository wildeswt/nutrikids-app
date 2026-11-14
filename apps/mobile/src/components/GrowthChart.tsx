import type { CurvePoint, ReferenceCurvesResponse } from '@nutrikids/shared';
import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import {
  axisTicks,
  clipSeries,
  computeDomain,
  downsample,
  projectPoint,
  toDashedSegments,
  toSegments,
  type ChartDomain,
  type IndicatorInfo,
  type LineSegment,
} from '../lib/growth-chart.js';

const PLOT_HEIGHT = 150;
const DEFAULT_PLOT_WIDTH = 280;
const DOT_SIZE = 14;
const CHILD_COLOR = '#F77E4D';
const REFERENCE_COLOR = '#52A789';

export interface GrowthChartProps {
  curves: ReferenceCurvesResponse;
  /** Child measurements already converted to the axes of the chart. */
  points: readonly CurvePoint[];
  xAxis: IndicatorInfo['xAxis'];
  /** Text of an X axis tick (age or length/height). */
  formatTick: (value: number) => string;
  testID?: string;
}

function Line({
  segments,
  thickness,
  color,
  testID,
}: {
  segments: readonly LineSegment[];
  thickness: number;
  color: string;
  testID?: string;
}) {
  return (
    <>
      {segments.map((segment, index) => (
        <View
          key={index}
          testID={testID}
          style={{
            position: 'absolute',
            left: segment.centerX - segment.length / 2,
            top: segment.centerY - thickness / 2,
            width: segment.length,
            height: thickness,
            backgroundColor: color,
            transform: [{ rotate: `${segment.angle}deg` }],
          }}
        />
      ))}
    </>
  );
}

/**
 * Growth chart without a drawing library: the WHO band between -2 and +2 DE is built from thin
 * columns, the curves from rotated segments and the child's checkups from absolutely positioned
 * dots, all computed from the data (see `lib/growth-chart.ts`).
 */
export function GrowthChart({ curves, points, xAxis, formatTick, testID }: GrowthChartProps) {
  const [plotWidth, setPlotWidth] = useState(DEFAULT_PLOT_WIDTH);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0) setPlotWidth(width);
  };

  const domain: ChartDomain | null = computeDomain(curves.curves, points, xAxis);
  if (!domain) return null;

  const project = (point: CurvePoint) => projectPoint(point, domain, plotWidth, PLOT_HEIGHT);
  const sampled = (series: readonly CurvePoint[]) =>
    downsample(clipSeries(series, domain.xMin, domain.xMax));

  const lower = sampled(curves.curves['-2']);
  const upper = sampled(curves.curves['+2']);
  const median = sampled(curves.curves['0']);

  const lowerPixels = lower.map(project);
  const upperPixels = upper.map(project);
  const childPixels = points.map(project);

  return (
    <View style={styles.wrapper} testID={testID ?? 'growth-chart'}>
      <View style={styles.plot} onLayout={handleLayout}>
        {/* Shaded normal band (-2 to +2 DE), one column per sample */}
        {lowerPixels.slice(0, -1).map((from, index) => {
          const to = lowerPixels[index + 1]!;
          const top = Math.min(upperPixels[index]!.top, upperPixels[index + 1]!.top);
          const bottom = Math.max(from.top, to.top);
          return (
            <View
              key={index}
              testID="growth-chart-band"
              style={{
                position: 'absolute',
                left: from.left,
                width: to.left - from.left + 1,
                top,
                height: Math.max(bottom - top, 1),
                backgroundColor: PALETTE.primaryLight,
              }}
            />
          );
        })}

        <Line
          segments={toDashedSegments(upperPixels)}
          thickness={1.5}
          color={REFERENCE_COLOR}
          testID="growth-chart-upper-bound"
        />
        <Line
          segments={toDashedSegments(lowerPixels)}
          thickness={1.5}
          color={REFERENCE_COLOR}
          testID="growth-chart-lower-bound"
        />
        <Line
          segments={toSegments(median.map(project))}
          thickness={2}
          color={REFERENCE_COLOR}
          testID="growth-chart-median"
        />

        <Line segments={toSegments(childPixels)} thickness={3} color={CHILD_COLOR} />
        {childPixels.map((pixel, index) => (
          <View
            key={index}
            testID="growth-chart-point"
            style={[
              styles.dot,
              index === childPixels.length - 1 && styles.dotLatest,
              { left: pixel.left - DOT_SIZE / 2, top: pixel.top - DOT_SIZE / 2 },
            ]}
          />
        ))}
      </View>

      <View style={styles.xAxisRow}>
        {axisTicks(domain).map((tick) => (
          <Text key={tick} style={styles.xAxisLabel}>
            {formatTick(tick)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  plot: {
    height: PLOT_HEIGHT,
    marginHorizontal: DOT_SIZE / 2,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: CHILD_COLOR,
  },
  dotLatest: {
    backgroundColor: CHILD_COLOR,
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: DOT_SIZE / 2,
    marginTop: 8,
  },
  xAxisLabel: {
    fontFamily: font('medium'),
    fontSize: 11,
    color: PALETTE.text.muted,
    fontWeight: '500',
  },
});
