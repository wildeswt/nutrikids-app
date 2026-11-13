import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../../constants/colors.js';

type IndicatorKey = 'PE' | 'TE' | 'PT' | 'IMCE';

interface IndicatorInfo {
  key: IndicatorKey;
  label: string;
  fullName: string;
  subtitle: string;
  xLabels: string[];
  yRangeLabel: string;
  activeStatus: string;
}

const INDICATORS: IndicatorInfo[] = [
  {
    key: 'PE',
    label: 'P/E',
    fullName: 'Peso para la Edad',
    subtitle: 'Curva de crecimiento OMS',
    xLabels: ['3 años', '3 años 3m', '3 años 5m'],
    yRangeLabel: 'kg',
    activeStatus: 'Adecuado',
  },
  {
    key: 'TE',
    label: 'T/E',
    fullName: 'Talla para la Edad',
    subtitle: 'Curva de crecimiento OMS',
    xLabels: ['3 años', '3 años 3m', '3 años 5m'],
    yRangeLabel: 'cm',
    activeStatus: 'Adecuado',
  },
  {
    key: 'PT',
    label: 'P/T',
    fullName: 'Peso para la Talla',
    subtitle: 'Curva de crecimiento OMS',
    xLabels: ['92 cm', '94 cm', '96 cm'],
    yRangeLabel: 'kg',
    activeStatus: 'Tendencia Favorable',
  },
  {
    key: 'IMCE',
    label: 'IMC/E',
    fullName: 'IMC para la Edad',
    subtitle: 'Curva de crecimiento OMS',
    xLabels: ['3 años', '3 años 3m', '3 años 5m'],
    yRangeLabel: 'kg/m²',
    activeStatus: 'Adecuado',
  },
];

export default function EvolutionScreen() {
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorKey>('PT');

  const activeIndicator =
    INDICATORS.find((item) => item.key === selectedIndicator) ?? INDICATORS[2];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Título de la pantalla */}
        <Text style={styles.screenTitle}>Evolución de Mateo</Text>

        {/* Tarjeta Naranja Superior: Datos del niño */}
        <View style={styles.childHeaderCard}>
          <Text style={styles.childNameTitle}>Mateo José Rodríguez</Text>
          <Text style={styles.childSubtitle}>3 años y 5 meses - 12 de mayo de 2023</Text>
        </View>

        {/* Selector de Indicadores Antropométricos: P/E, T/E, P/T, IMC/E */}
        <View style={styles.indicatorTabsContainer}>
          {INDICATORS.map((indicator) => {
            const isSelected = indicator.key === selectedIndicator;
            return (
              <Pressable
                key={indicator.key}
                style={[styles.indicatorTab, isSelected && styles.indicatorTabActive]}
                onPress={() => setSelectedIndicator(indicator.key)}
                accessibilityRole="button"
                accessibilityLabel={indicator.fullName}
              >
                <Text
                  style={[styles.indicatorTabText, isSelected && styles.indicatorTabTextActive]}
                >
                  {indicator.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tarjeta de Gráfica de Crecimiento */}
        <View style={styles.chartCard}>
          {/* Cabecera del gráfico */}
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleWrapper}>
              <Text style={styles.chartTitleText}>{activeIndicator.fullName}</Text>
              <Text style={styles.chartSubtitleText}>{activeIndicator.subtitle}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.infoIconWrapper, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Información sobre la curva"
            >
              <Ionicons name="information-circle-outline" size={26} color="#2D5F5A" />
            </Pressable>
          </View>

          {/* Gráfico SVG-like con vista estilizada de curvas OMS */}
          <View style={styles.chartPlotArea}>
            {/* Franja sombreada de normalidad OMS (Z-score -2 a +2) */}
            <View style={styles.omsBand}>
              {/* Línea superior (+2 DE) punteada */}
              <View style={styles.dashedLineTop} />

              {/* Línea media (Mediana OMS / Z=0) */}
              <View style={styles.omsMedianLine} />

              {/* Línea inferior (-2 DE) punteada */}
              <View style={styles.dashedLineBottom} />

              {/* Trayectoria del niño (línea naranja y puntos) */}
              <View style={styles.childTrajectoryContainer}>
                {/* Segmento de línea que conecta los puntos */}
                <View style={styles.childLineSegment} />

                {/* Punto 1 */}
                <View style={[styles.dataPoint, styles.point1]} />

                {/* Punto 2 */}
                <View style={[styles.dataPoint, styles.point2]} />

                {/* Punto 3 (reciente y sólido) */}
                <View style={[styles.dataPoint, styles.dataPointFilled, styles.point3]} />
              </View>
            </View>

            {/* Eje X con etiquetas de referencia */}
            <View style={styles.xAxisRow}>
              {activeIndicator.xLabels.map((lbl, idx) => (
                <Text key={idx} style={styles.xAxisLabel}>
                  {lbl}
                </Text>
              ))}
            </View>
          </View>

          {/* Leyenda del gráfico */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotChild]} />
              <Text style={styles.legendText}>Mateo</Text>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotOms]} />
              <Text style={styles.legendText}>Referencia OMS</Text>
            </View>

            <Text style={styles.statusLegendText}>{activeIndicator.activeStatus}</Text>
          </View>
        </View>

        {/* Tarjeta Inferior de Último Registro */}
        <View style={styles.lastRecordCard}>
          <Text style={styles.lastRecordTitle}>Último Registro - 18 de agosto de 2026</Text>

          <View style={styles.lastRecordDetailsRow}>
            {/* Peso */}
            <View style={styles.recordDetailItem}>
              <View style={styles.recordIconBox}>
                <Ionicons name="scale-outline" size={20} color="#C2410C" />
              </View>
              <View>
                <Text style={styles.recordDetailLabel}>Peso</Text>
                <Text style={styles.recordDetailValue}>13,8kg</Text>
              </View>
            </View>

            {/* Talla */}
            <View style={styles.recordDetailItem}>
              <View style={styles.recordIconBox}>
                <Ionicons name="resize-outline" size={20} color="#C2410C" />
              </View>
              <View>
                <Text style={styles.recordDetailLabel}>Talla</Text>
                <Text style={styles.recordDetailValue}>95,0cm</Text>
              </View>
            </View>

            {/* Registró */}
            <View style={styles.recordDetailItem}>
              <View style={styles.recordIconBox}>
                <Ionicons name="person-outline" size={20} color="#C2410C" />
              </View>
              <View>
                <Text style={styles.recordDetailLabel}>Registró</Text>
                <Text style={styles.recordDetailValue} numberOfLines={1}>
                  Dra. Ana Juarez
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.text.title,
    marginBottom: 16,
  },
  childHeaderCard: {
    backgroundColor: PALETTE.secondary,
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 22,
    marginBottom: 20,
    shadowColor: PALETTE.secondary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  childNameTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
  },
  childSubtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
  },
  indicatorTabsContainer: {
    flexDirection: 'row',
    backgroundColor: PALETTE.primary,
    borderRadius: 26,
    padding: 5,
    marginBottom: 22,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  indicatorTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  indicatorTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  indicatorTabTextActive: {
    color: PALETTE.primary,
  },
  chartCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chartTitleWrapper: {
    flex: 1,
    alignItems: 'center',
    marginLeft: 26,
  },
  chartTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  chartSubtitleText: {
    fontSize: 12,
    color: PALETTE.text.muted,
    marginTop: 2,
  },
  infoIconWrapper: {
    padding: 2,
  },
  chartPlotArea: {
    height: 190,
    justifyContent: 'center',
    marginBottom: 14,
  },
  omsBand: {
    height: 120,
    backgroundColor: '#E7F5EE',
    borderRadius: 6,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    transform: [{ rotate: '-2deg' }],
  },
  dashedLineTop: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderTopColor: '#52A789',
    borderStyle: 'dashed',
  },
  omsMedianLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#52A789',
  },
  dashedLineBottom: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderTopColor: '#52A789',
    borderStyle: 'dashed',
  },
  childTrajectoryContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  childLineSegment: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    top: '49%',
    height: 3,
    backgroundColor: '#F77E4D',
    transform: [{ rotate: '-1.5deg' }],
  },
  dataPoint: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F77E4D',
  },
  dataPointFilled: {
    backgroundColor: '#F77E4D',
  },
  point1: {
    left: '20%',
    top: '45%',
  },
  point2: {
    left: '50%',
    top: '44%',
  },
  point3: {
    left: '73%',
    top: '42%',
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    marginTop: 18,
  },
  xAxisLabel: {
    fontSize: 11,
    color: PALETTE.text.muted,
    fontWeight: '500',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendDotChild: {
    backgroundColor: '#F77E4D',
  },
  legendDotOms: {
    backgroundColor: '#7FA89E',
  },
  legendText: {
    fontSize: 12,
    color: PALETTE.text.body,
    fontWeight: '500',
  },
  statusLegendText: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.primary,
  },
  lastRecordCard: {
    backgroundColor: '#FDC4A8',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#F77E4D',
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#F77E4D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 2,
  },
  lastRecordTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#9A3412',
    textAlign: 'center',
    marginBottom: 14,
  },
  lastRecordDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  recordIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFEADF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDetailLabel: {
    fontSize: 11,
    color: '#9A3412',
    fontWeight: '600',
  },
  recordDetailValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7C2D12',
  },
  pressed: {
    opacity: 0.7,
  },
});
