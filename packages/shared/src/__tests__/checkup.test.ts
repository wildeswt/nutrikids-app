import { describe, expect, it } from 'vitest';
import {
  CaregiverCheckupResponseSchema,
  CaregiverIndicatorResultSchema,
  CheckupResponseSchema,
  CorrectCheckupInputSchema,
  CreateCheckupInputSchema,
  IndicatorResultSchema,
  ReferenceCurvesQuerySchema,
  ReferenceCurvesResponseSchema,
} from '../index.js';

const mateoCheckup = {
  id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
  measuredAt: '2026-10-18T14:30:00-05:00',
  weightKg: 12.2,
  lengthHeightCm: 97.0,
  position: 'STANDING',
};

describe('CreateCheckupInputSchema y CorrectCheckupInputSchema', () => {
  it('acepta el control de Mateo dentro del rango plausible sin pedir confirmación', () => {
    expect(CreateCheckupInputSchema.safeParse(mateoCheckup).success).toBe(true);
    expect(CorrectCheckupInputSchema.safeParse(mateoCheckup).success).toBe(true);
  });

  it('rechaza valores fuera de los límites físicos duros de la BD (2-40 kg, 40-140 cm)', () => {
    const lowWeight = CreateCheckupInputSchema.safeParse({
      ...mateoCheckup,
      weightKg: 1.9,
      confirmOutlier: true,
    });
    expect(lowWeight.success).toBe(false);
    expect(lowWeight.error?.issues[0]?.message).toBe('El peso debe estar entre 2 y 40 kg');

    const highWeight = CreateCheckupInputSchema.safeParse({
      ...mateoCheckup,
      weightKg: 40.1,
      confirmOutlier: true,
    });
    expect(highWeight.success).toBe(false);

    const lowHeight = CreateCheckupInputSchema.safeParse({
      ...mateoCheckup,
      lengthHeightCm: 39.9,
      confirmOutlier: true,
    });
    expect(lowHeight.success).toBe(false);
    expect(lowHeight.error?.issues[0]?.message).toBe(
      'La longitud o talla debe estar entre 40 y 140 cm',
    );

    const highHeight = CreateCheckupInputSchema.safeParse({
      ...mateoCheckup,
      lengthHeightCm: 140.1,
      confirmOutlier: true,
    });
    expect(highHeight.success).toBe(false);
  });

  it('exige confirmOutlier: true cuando el peso o la talla son atípicos (RF-05, PU-06)', () => {
    const outlierWeight = CreateCheckupInputSchema.safeParse({
      ...mateoCheckup,
      weightKg: 4.5,
    });
    expect(outlierWeight.success).toBe(false);
    expect(outlierWeight.error?.issues[0]?.message).toBe(
      'El peso es atípico; confirma la medida antes de guardar',
    );

    expect(
      CreateCheckupInputSchema.safeParse({
        ...mateoCheckup,
        weightKg: 4.5,
        confirmOutlier: true,
      }).success,
    ).toBe(true);

    const outlierHeight = CreateCheckupInputSchema.safeParse({
      ...mateoCheckup,
      lengthHeightCm: 55.0,
    });
    expect(outlierHeight.success).toBe(false);
    expect(outlierHeight.error?.issues[0]?.message).toBe(
      'La longitud o talla es atípica; confirma la medida antes de guardar',
    );

    expect(
      CreateCheckupInputSchema.safeParse({
        ...mateoCheckup,
        lengthHeightCm: 55.0,
        confirmOutlier: true,
      }).success,
    ).toBe(true);
  });

  it('rechaza origin, recordedById y cualquier campo del servidor en la entrada', () => {
    expect(
      CreateCheckupInputSchema.safeParse({ ...mateoCheckup, origin: 'CAREGIVER' }).success,
    ).toBe(false);
    expect(
      CreateCheckupInputSchema.safeParse({
        ...mateoCheckup,
        recordedById: '4a2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      }).success,
    ).toBe(false);
  });

  it('acepta resultados calculados por el celular (el servidor los ignora y recalcula)', () => {
    const withClientResults = {
      ...mateoCheckup,
      results: [
        { indicator: 'WEIGHT_FOR_LENGTH_HEIGHT', zScore: -2.2, classification: 'WASTING' },
        { indicator: 'WEIGHT_FOR_AGE' },
      ],
    };
    expect(CreateCheckupInputSchema.safeParse(withClientResults).success).toBe(true);
    expect(CorrectCheckupInputSchema.safeParse(withClientResults).success).toBe(true);
    expect(
      CreateCheckupInputSchema.safeParse({
        ...mateoCheckup,
        results: Array.from({ length: 5 }, () => ({ indicator: 'WEIGHT_FOR_AGE' })),
      }).success,
    ).toBe(false);
    expect(
      CreateCheckupInputSchema.safeParse({ ...mateoCheckup, results: [{ indicator: 'X' }] })
        .success,
    ).toBe(false);
  });

  it('exige fecha ISO 8601 con zona horaria y UUID válido', () => {
    expect(
      CreateCheckupInputSchema.safeParse({
        ...mateoCheckup,
        measuredAt: '2026-10-18T14:30:00',
      }).success,
    ).toBe(false);
    expect(CreateCheckupInputSchema.safeParse({ ...mateoCheckup, id: 'abc' }).success).toBe(false);
  });
});

describe('IndicatorResultSchema y respuestas de control (profesional vs cuidador)', () => {
  const resultRow = {
    id: '5b2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
    checkupId: mateoCheckup.id,
    indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
    zScore: -2.21,
    percentile: 1.36,
    classification: 'WASTING',
    referenceVersion: 'WHO-2006',
  };

  const fullCheckup = {
    ...mateoCheckup,
    childId: '4a2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
    origin: 'CAREGIVER',
    recordedById: '6c2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
    correctedCheckupId: null,
    isCurrent: true,
    createdAt: '2026-10-18T14:31:00Z',
    results: [resultRow],
  };

  it('valida el resultado del indicador y el rango de percentil (0 a 100)', () => {
    expect(IndicatorResultSchema.safeParse(resultRow).success).toBe(true);
    expect(IndicatorResultSchema.safeParse({ ...resultRow, percentile: -0.1 }).success).toBe(false);
    expect(IndicatorResultSchema.safeParse({ ...resultRow, percentile: 100.1 }).success).toBe(
      false,
    );
  });

  it('CheckupResponseSchema (profesional) incluye los resultados técnicos', () => {
    const parsed = CheckupResponseSchema.parse(fullCheckup);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]?.zScore).toBe(-2.21);
  });

  it('CaregiverCheckupResponseSchema (cuidador) elimina resultados técnicos (z, percentil, clasificación)', () => {
    expect(Object.keys(CaregiverCheckupResponseSchema.shape)).not.toContain('results');
    const parsed = CaregiverCheckupResponseSchema.parse(fullCheckup);
    expect(parsed).not.toHaveProperty('results');
  });

  it('CaregiverIndicatorResultSchema (cuidador) no expone z, percentil ni clasificación', () => {
    const parsed = CaregiverIndicatorResultSchema.parse(resultRow);
    expect(parsed).toEqual({
      id: resultRow.id,
      checkupId: resultRow.checkupId,
      indicator: resultRow.indicator,
      referenceVersion: resultRow.referenceVersion,
    });
  });
});

describe('ReferenceCurvesQuerySchema y ReferenceCurvesResponseSchema', () => {
  it('valida la consulta y las 5 curvas (−3, −2, 0, +2 y +3)', () => {
    expect(
      ReferenceCurvesQuerySchema.safeParse({
        indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
        sex: 'MALE',
      }).success,
    ).toBe(true);
    expect(
      ReferenceCurvesQuerySchema.safeParse({
        indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
        sex: 'MALE',
        position: 'STANDING',
      }).success,
    ).toBe(true);
    expect(
      ReferenceCurvesQuerySchema.safeParse({
        indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
        sex: 'MALE',
        extra: 'no',
      }).success,
    ).toBe(false);

    expect(
      ReferenceCurvesResponseSchema.safeParse({
        version: 'WHO 2006',
        indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
        sex: 'MALE',
        xAxis: 'height_cm',
        curves: {
          '-3': [{ x: 97, y: 11.4 }],
          '-2': [{ x: 97, y: 12.4 }],
          '0': [{ x: 97, y: 14.6 }],
          '+2': [{ x: 97, y: 17.3 }],
          '+3': [{ x: 97, y: 18.9 }],
        },
      }).success,
    ).toBe(true);
  });
});
