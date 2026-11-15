import type { CurvePoint, ReferenceCurvesResponse } from '@nutrikids/shared';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import {
  axisTicks,
  clipSeries,
  computeDomain,
  computeZonePositions,
  downsample,
  projectPoint,
  toDashedSegments,
  toSegments,
  type ChartDomain,
  type IndicatorInfo,
  type LineSegment,
} from '../lib/growth-chart.js';

const PLOT_HEIGHT = 180;
const DEFAULT_PLOT_WIDTH = 280;
const DOT_SIZE = 14;
const HALO_SIZE = 26;
const HITBOX_SIZE = 28;
const CHILD_COLOR = '#F77E4D';
const REFERENCE_COLOR = '#52A789';
const OUTER_REFERENCE_COLOR = '#D9825B';

export interface GrowthChartPoint extends CurvePoint {
  checkupId?: string;
}

export interface GrowthChartZoneLabels {
  upper: string;
  normal: string;
  lower: string;
}

const DEFAULT_CAREGIVER_ZONE_LABELS: GrowthChartZoneLabels = {
  upper: 'Por encima de lo esperado',
  normal: 'Rango esperado (OMS)',
  lower: 'Por debajo de lo esperado',
};

const DEFAULT_PROFESSIONAL_ZONE_LABELS: GrowthChartZoneLabels = {
  upper: 'Zona +2 a +3 DE',
  normal: 'Rango esperado (−2 a +2 DE)',
  lower: 'Zona −2 a −3 DE',
};

const Z_CURVE_LABELS: ReadonlyArray<{
  key: '-3' | '-2' | '0' | '+2' | '+3';
  text: string;
}> = [
  { key: '+3', text: '+3' },
  { key: '+2', text: '+2' },
  { key: '0', text: '0' },
  { key: '-2', text: '−2' },
  { key: '-3', text: '−3' },
];

export interface GrowthChartProps {
  curves: ReferenceCurvesResponse;
  /** Child measurements already converted to the axes of the chart. */
  points: readonly GrowthChartPoint[];
  xAxis: IndicatorInfo['xAxis'];
  /** Text of an X axis tick (age or length/height). */
  formatTick: (value: number) => string;
  /** Role view mode: caregiver hides z-scores/DE; professional displays full technical labels. */
  variant?: 'caregiver' | 'professional';
  /** Custom localized zone labels between the curves. */
  zoneLabels?: GrowthChartZoneLabels;
  /** ID of the currently selected checkup point (defaults to the latest point). */
  selectedCheckupId?: string | null;
  /** Triggered when the user taps a plotted checkup point. */
  onSelectPoint?: (point: GrowthChartPoint, index: number) => void;
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
 * Growth chart without a drawing library: draws all 5 WHO curves (-3, -2, 0, +2, +3) for the
 * child's sex, shaded zones between curves with text labels, and interactive checkup points
 * (see `lib/growth-chart.ts`).
 */
export function GrowthChart({
  curves,
  points,
  xAxis,
  formatTick,
  variant = 'caregiver',
  zoneLabels,
  selectedCheckupId,
  onSelectPoint,
  testID,
}: GrowthChartProps) {
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

  const lower3 = sampled(curves.curves['-3']);
  const lower2 = sampled(curves.curves['-2']);
  const median = sampled(curves.curves['0']);
  const upper2 = sampled(curves.curves['+2']);
  const upper3 = sampled(curves.curves['+3']);

  const lower3Pixels = lower3.map(project);
  const lower2Pixels = lower2.map(project);
  const medianPixels = median.map(project);
  const upper2Pixels = upper2.map(project);
  const upper3Pixels = upper3.map(project);
  const childPixels = points.map(project);

  const zones = computeZonePositions(curves.curves, domain, PLOT_HEIGHT);
  const resolvedZoneLabels =
    zoneLabels ??
    (variant === 'professional' ? DEFAULT_PROFESSIONAL_ZONE_LABELS : DEFAULT_CAREGIVER_ZONE_LABELS);

  const clampTop = (top: number) => Math.max(4, Math.min(top - 8, PLOT_HEIGHT - 18));

  return (
    <View style={styles.wrapper} testID={testID ?? 'growth-chart'}>
      <View style={styles.plot} onLayout={handleLayout}>
        {/* Outer upper band (+2 to +3) */}
        {upper2Pixels.slice(0, -1).map((from, index) => {
          const to = upper2Pixels[index + 1]!;
          const top = Math.min(upper3Pixels[index]!.top, upper3Pixels[index + 1]!.top);
          const bottom = Math.max(from.top, to.top);
          return (
            <View
              key={`upper-outer-${index}`}
              testID="growth-chart-upper-outer-band"
              style={{
                position: 'absolute',
                left: from.left,
                width: to.left - from.left + 1,
                top,
                height: Math.max(bottom - top, 1),
                backgroundColor: PALETTE.secondaryLight,
                opacity: 0.45,
              }}
            />
          );
        })}

        {/* Shaded normal band (-2 to +2), one column per sample */}
        {lower2Pixels.slice(0, -1).map((from, index) => {
          const to = lower2Pixels[index + 1]!;
          const top = Math.min(upper2Pixels[index]!.top, upper2Pixels[index + 1]!.top);
          const bottom = Math.max(from.top, to.top);
          return (
            <View
              key={`normal-${index}`}
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

        {/* Outer lower band (-3 to -2) */}
        {lower3Pixels.slice(0, -1).map((from, index) => {
          const to = lower3Pixels[index + 1]!;
          const top = Math.min(lower2Pixels[index]!.top, lower2Pixels[index + 1]!.top);
          const bottom = Math.max(from.top, to.top);
          return (
            <View
              key={`lower-outer-${index}`}
              testID="growth-chart-lower-outer-band"
              style={{
                position: 'absolute',
                left: from.left,
                width: to.left - from.left + 1,
                top,
                height: Math.max(bottom - top, 1),
                backgroundColor: PALETTE.secondaryLight,
                opacity: 0.45,
              }}
            />
          );
        })}

        {/* 5 WHO curves: +3, +2, 0, -2, -3 */}
        <Line
          segments={toDashedSegments(upper3Pixels, 3, 4)}
          thickness={1.25}
          color={OUTER_REFERENCE_COLOR}
          testID="growth-chart-upper-extreme"
        />
        <Line
          segments={toDashedSegments(upper2Pixels)}
          thickness={1.5}
          color={REFERENCE_COLOR}
          testID="growth-chart-upper-bound"
        />
        <Line
          segments={toSegments(medianPixels)}
          thickness={2}
          color={REFERENCE_COLOR}
          testID="growth-chart-median"
        />
        <Line
          segments={toDashedSegments(lower2Pixels)}
          thickness={1.5}
          color={REFERENCE_COLOR}
          testID="growth-chart-lower-bound"
        />
        <Line
          segments={toDashedSegments(lower3Pixels, 3, 4)}
          thickness={1.25}
          color={OUTER_REFERENCE_COLOR}
          testID="growth-chart-lower-extreme"
        />

        {/* Zone text labels between the lines */}
        <Text
          testID="growth-chart-zone-label-upper"
          style={[styles.zoneLabel, styles.zoneLabelOuter, { top: clampTop(zones.upperZoneTop) }]}
          numberOfLines={1}
        >
          {resolvedZoneLabels.upper}
        </Text>
        <Text
          testID="growth-chart-zone-label-normal"
          style={[styles.zoneLabel, styles.zoneLabelNormal, { top: clampTop(zones.normalZoneTop) }]}
          numberOfLines={1}
        >
          {resolvedZoneLabels.normal}
        </Text>
        <Text
          testID="growth-chart-zone-label-lower"
          style={[styles.zoneLabel, styles.zoneLabelOuter, { top: clampTop(zones.lowerZoneTop) }]}
          numberOfLines={1}
        >
          {resolvedZoneLabels.lower}
        </Text>

        {/* Technical z-score curve labels ONLY in professional view */}
        {variant === 'professional' &&
          Z_CURVE_LABELS.map(({ key, text }) => (
            <Text
              key={key}
              testID={`growth-chart-z-label-${key}`}
              style={[
                styles.zCurveLabel,
                (key === '+3' || key === '-3') && styles.zCurveLabelExtreme,
                { top: clampTop(zones.curveRightTops[key]) },
              ]}
            >
              {text}
            </Text>
          ))}

        {/* Child trajectory and interactive points */}
        <Line segments={toSegments(childPixels)} thickness={3} color={CHILD_COLOR} />
        {childPixels.map((pixel, index) => {
          const point = points[index]!;
          const isLatest = index === childPixels.length - 1;
          const isSelected = selectedCheckupId ? point.checkupId === selectedCheckupId : isLatest;

          return (
            <React.Fragment key={point.checkupId ?? index}>
              {isSelected && (
                <View
                  testID="growth-chart-selected-halo"
                  style={[
                    styles.halo,
                    { left: pixel.left - HALO_SIZE / 2, top: pixel.top - HALO_SIZE / 2 },
                  ]}
                />
              )}
              <View
                testID="growth-chart-point"
                style={[
                  styles.dot,
                  (isLatest || isSelected) && styles.dotLatest,
                  { left: pixel.left - DOT_SIZE / 2, top: pixel.top - DOT_SIZE / 2 },
                ]}
              />
              {onSelectPoint && (
                <Pressable
                  testID={`growth-chart-point-pressable-${index}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => onSelectPoint(point, index)}
                  style={[
                    styles.pointHitbox,
                    { left: pixel.left - HITBOX_SIZE / 2, top: pixel.top - HITBOX_SIZE / 2 },
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
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
  zoneLabel: {
    position: 'absolute',
    left: 6,
    fontFamily: font('medium'),
    fontSize: 10,
    fontWeight: '500',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  zoneLabelNormal: {
    color: PALETTE.primary,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  zoneLabelOuter: {
    color: PALETTE.text.body,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  zCurveLabel: {
    position: 'absolute',
    right: 4,
    fontFamily: font('semibold'),
    fontSize: 9,
    fontWeight: '600',
    color: PALETTE.primary,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  zCurveLabelExtreme: {
    color: PALETTE.secondaryPressed,
  },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: CHILD_COLOR,
    opacity: 0.22,
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
  pointHitbox: {
    position: 'absolute',
    width: HITBOX_SIZE,
    height: HITBOX_SIZE,
    borderRadius: HITBOX_SIZE / 2,
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
