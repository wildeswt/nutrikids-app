import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { formatDecimal, formatShortDate } from '../i18n/format.js';
import { toSegments, type PixelPoint } from '../lib/growth-chart.js';
import { xPositions, yPosition, Z_TICKS, type ZPoint } from '../lib/alert-detail.js';

const PLOT_HEIGHT = 168;
const DEFAULT_PLOT_WIDTH = 260;
const AXIS_WIDTH = 30;
const DOT_SIZE = 14;
const HALO_SIZE = 30;
const LABEL_WIDTH = 56;
/** Beyond this many points only the first, the last and the alert's one get a date label. */
const MAX_DATE_LABELS = 5;

export interface ZScoreChartProps {
  /** Checkups of the child, oldest first (see `zSeriesFor`). */
  points: readonly ZPoint[];
  testID?: string;
}

/** Indexes of the points that show their date under the plot. */
export function dateLabelIndexes(points: readonly ZPoint[]): number[] {
  const all = points.map((_, index) => index);
  if (points.length <= MAX_DATE_LABELS) return all;
  return all.filter(
    (index) => index === 0 || index === points.length - 1 || points[index]!.isAlert,
  );
}

/**
 * Evolution of one indicator as a z-score chart (no drawing library, like `GrowthChart`): the
 * normal band (−2 to +2), the risk zone below it, the child's checkups joined by a line and the
 * checkup that raised the alert highlighted with a halo.
 */
export function ZScoreChart({ points, testID }: ZScoreChartProps) {
  const [plotWidth, setPlotWidth] = useState(DEFAULT_PLOT_WIDTH);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0) setPlotWidth(width);
  };

  const xs = xPositions(points);
  const pixels: PixelPoint[] = points.map((point, index) => ({
    left: xs[index]! * plotWidth,
    top: yPosition(point.z) * PLOT_HEIGHT,
  }));
  const top = (z: number) => yPosition(z) * PLOT_HEIGHT;
  const labelled = dateLabelIndexes(points);

  return (
    <View style={styles.wrapper} testID={testID ?? 'z-score-chart'}>
      <View style={styles.row}>
        <View style={styles.axis}>
          {Z_TICKS.map((tick) => (
            <Text key={tick} style={[styles.axisLabel, { top: top(tick) - 7 }]}>
              {tick > 0 ? `+${tick}` : tick < 0 ? `−${Math.abs(tick)}` : '0'}
            </Text>
          ))}
        </View>

        <View style={styles.plot} onLayout={handleLayout}>
          {/* Zones: above +2, normal band, risk below −2 */}
          <View style={[styles.zone, styles.zoneHigh, { top: 0, height: top(2) }]} />
          <View
            testID="z-chart-normal-band"
            style={[styles.zone, styles.zoneNormal, { top: top(2), height: top(-2) - top(2) }]}
          />
          <View
            testID="z-chart-risk-zone"
            style={[styles.zone, styles.zoneRisk, { top: top(-2), height: PLOT_HEIGHT - top(-2) }]}
          />
          <View style={[styles.guide, styles.guideMedian, { top: top(0) }]} />
          <View style={[styles.guide, styles.guideRisk, { top: top(-2) }]} />
          <View style={[styles.guide, styles.guideRisk, { top: top(-3) }]} />

          {toSegments(pixels).map((segment, index) => (
            <View
              key={index}
              style={{
                position: 'absolute',
                left: segment.centerX - segment.length / 2,
                top: segment.centerY - 1.5,
                width: segment.length,
                height: 3,
                backgroundColor: CHILD_COLOR,
                transform: [{ rotate: `${segment.angle}deg` }],
              }}
            />
          ))}

          {points.map((point, index) => {
            const pixel = pixels[index]!;
            return point.isAlert ? (
              <React.Fragment key={point.checkupId}>
                <View
                  testID="z-chart-halo"
                  style={[
                    styles.halo,
                    { left: pixel.left - HALO_SIZE / 2, top: pixel.top - HALO_SIZE / 2 },
                  ]}
                />
                <View
                  testID="z-chart-alert-point"
                  style={[
                    styles.dot,
                    styles.dotAlert,
                    { left: pixel.left - DOT_SIZE / 2, top: pixel.top - DOT_SIZE / 2 },
                  ]}
                />
                <Text
                  style={[
                    styles.zLabel,
                    { left: Math.max(0, pixel.left - 70), top: Math.min(pixel.top + 14, 150) },
                  ]}
                  testID="z-chart-alert-label"
                >
                  {`z = ${formatDecimal(point.z)}`}
                </Text>
              </React.Fragment>
            ) : (
              <View
                key={point.checkupId}
                testID="z-chart-point"
                style={[
                  styles.dot,
                  { left: pixel.left - DOT_SIZE / 2, top: pixel.top - DOT_SIZE / 2 },
                ]}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.dates}>
        {labelled.map((index) => (
          <Text
            key={points[index]!.checkupId}
            style={[
              styles.dateLabel,
              { left: AXIS_WIDTH + xs[index]! * plotWidth - LABEL_WIDTH / 2 },
            ]}
          >
            {formatShortDate(new Date(points[index]!.measuredAt))}
          </Text>
        ))}
      </View>
    </View>
  );
}

const CHILD_COLOR = PALETTE.secondary;

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  row: { flexDirection: 'row' },
  axis: { width: AXIS_WIDTH, height: PLOT_HEIGHT },
  axisLabel: {
    position: 'absolute',
    right: 6,
    fontSize: 11,
    fontWeight: '500',
    color: PALETTE.text.muted,
  },
  plot: { flex: 1, height: PLOT_HEIGHT, overflow: 'visible' },
  zone: { position: 'absolute', left: 0, right: 0 },
  zoneHigh: { backgroundColor: PALETTE.border.subtle },
  zoneNormal: { backgroundColor: PALETTE.primaryLight },
  zoneRisk: { backgroundColor: PALETTE.secondaryLight },
  guide: { position: 'absolute', left: 0, right: 0, height: 1 },
  guideMedian: { backgroundColor: PALETTE.primary },
  guideRisk: { backgroundColor: PALETTE.secondary, opacity: 0.5 },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: PALETTE.surface,
    borderWidth: 3,
    borderColor: CHILD_COLOR,
  },
  dotAlert: { backgroundColor: CHILD_COLOR, borderColor: PALETTE.surface },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: PALETTE.secondary,
    opacity: 0.25,
  },
  zLabel: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.secondaryPressed,
  },
  dates: { height: 16 },
  dateLabel: {
    position: 'absolute',
    width: LABEL_WIDTH,
    textAlign: 'center',
    fontSize: 11,
    color: PALETTE.text.muted,
    fontWeight: '500',
  },
});
