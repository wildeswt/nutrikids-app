import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema, requiredText } from './common.js';
import { IndicatorSchema, OriginSchema, PositionSchema } from './enums.js';

/**
 * Controles antropométricos y resultados de indicadores OMS.
 */

/** Límites físicos duros (coinciden con los CHECK de la tabla `checkups`). */
export const WEIGHT_MIN_KG = 2;
export const WEIGHT_MAX_KG = 40;
export const LENGTH_HEIGHT_MIN_CM = 40;
export const LENGTH_HEIGHT_MAX_CM = 140;

/**
 * Rango plausible esperado para niños de 12 a 60 meses.
 * Un valor dentro de los límites físicos pero fuera de este rango es atípico
 * y exige `confirmOutlier: true` antes de guardarse.
 */
export const PLAUSIBLE_WEIGHT_MIN_KG = 6;
export const PLAUSIBLE_WEIGHT_MAX_KG = 30;
export const PLAUSIBLE_LENGTH_HEIGHT_MIN_CM = 65;
export const PLAUSIBLE_LENGTH_HEIGHT_MAX_CM = 125;

export function isPlausibleWeight(weightKg: number): boolean {
  return weightKg >= PLAUSIBLE_WEIGHT_MIN_KG && weightKg <= PLAUSIBLE_WEIGHT_MAX_KG;
}

export function isPlausibleLengthHeight(lengthHeightCm: number): boolean {
  return (
    lengthHeightCm >= PLAUSIBLE_LENGTH_HEIGHT_MIN_CM &&
    lengthHeightCm <= PLAUSIBLE_LENGTH_HEIGHT_MAX_CM
  );
}

const WeightKgSchema = z
  .number({ error: 'El peso debe ser un número' })
  .min(WEIGHT_MIN_KG, { error: `El peso debe estar entre ${WEIGHT_MIN_KG} y ${WEIGHT_MAX_KG} kg` })
  .max(WEIGHT_MAX_KG, { error: `El peso debe estar entre ${WEIGHT_MIN_KG} y ${WEIGHT_MAX_KG} kg` });

const LengthHeightCmSchema = z
  .number({ error: 'La longitud o talla debe ser un número' })
  .min(LENGTH_HEIGHT_MIN_CM, {
    error: `La longitud o talla debe estar entre ${LENGTH_HEIGHT_MIN_CM} y ${LENGTH_HEIGHT_MAX_CM} cm`,
  })
  .max(LENGTH_HEIGHT_MAX_CM, {
    error: `La longitud o talla debe estar entre ${LENGTH_HEIGHT_MIN_CM} y ${LENGTH_HEIGHT_MAX_CM} cm`,
  });

function validateOutlierConfirmation(
  value: { weightKg: number; lengthHeightCm: number; confirmOutlier?: boolean | undefined },
  ctx: z.RefinementCtx,
) {
  if (!isPlausibleWeight(value.weightKg) && value.confirmOutlier !== true) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmOutlier'],
      message: 'El peso es atípico; confirma la medida antes de guardar',
    });
  }
  if (!isPlausibleLengthHeight(value.lengthHeightCm) && value.confirmOutlier !== true) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmOutlier'],
      message: 'La longitud o talla es atípica; confirma la medida antes de guardar',
    });
  }
}

// ---------- Entrada ----------

const BaseCheckupInputObject = z.strictObject({
  /** UUID generado en el cliente para garantizar idempotencia sin conexión. */
  id: UuidSchema,
  measuredAt: IsoDateTimeSchema,
  weightKg: WeightKgSchema,
  lengthHeightCm: LengthHeightCmSchema,
  position: PositionSchema,
  /** Bandera de confirmación cuando el peso o la talla están fuera del rango plausible. */
  confirmOutlier: z.boolean().optional(),
});

/**
 * Creación de un control (`POST /children/:childId/checkups`).
 * `origin` y `recordedById` los asigna el servidor a partir de la sesión autenticada.
 */
export const CreateCheckupInputSchema = BaseCheckupInputObject.superRefine(
  validateOutlierConfirmation,
);

/**
 * Corrección de un control (`POST /checkups/:checkupId/correction`).
 * Un control nunca se edita: crea un control nuevo que referencia al original.
 */
export const CorrectCheckupInputSchema = BaseCheckupInputObject.superRefine(
  validateOutlierConfirmation,
);

// ---------- Salida ----------

/** Resultado de un indicador antropométrico (vista profesional). */
export const IndicatorResultSchema = z.object({
  id: UuidSchema,
  checkupId: UuidSchema,
  indicator: IndicatorSchema,
  zScore: z.number(),
  percentile: z
    .number()
    .min(0, { error: 'El percentil debe estar entre 0 y 100' })
    .max(100, { error: 'El percentil debe estar entre 0 y 100' }),
  classification: requiredText(100),
  referenceVersion: requiredText(50),
});

const BaseCheckupResponseShape = {
  id: UuidSchema,
  childId: UuidSchema,
  measuredAt: IsoDateTimeSchema,
  weightKg: WeightKgSchema,
  lengthHeightCm: LengthHeightCmSchema,
  position: PositionSchema,
  origin: OriginSchema,
  recordedById: UuidSchema,
  /** Control original al que este control corrige (null si no es una corrección). */
  correctedCheckupId: UuidSchema.nullable(),
  /** Derivado: `true` si ningún otro control lo corrige (es el que cuenta para gráficas y alertas). */
  isCurrent: z.boolean(),
  createdAt: IsoDateTimeSchema,
};

/**
 * Respuesta de un control para el perfil profesional (incluye los 4 resultados
 * técnicos con puntaje z, percentil y clasificación).
 */
export const CheckupResponseSchema = z.object({
  ...BaseCheckupResponseShape,
  results: z.array(IndicatorResultSchema),
});

/**
 * Respuesta de un control para el perfil cuidador (RF-14, NK-17, NK-22, NK-31).
 * Nunca expone puntajes z, percentiles ni clasificaciones técnicas.
 */
export const CaregiverCheckupResponseSchema = z.object(BaseCheckupResponseShape);

export type CreateCheckupInput = z.infer<typeof CreateCheckupInputSchema>;
export type CorrectCheckupInput = z.infer<typeof CorrectCheckupInputSchema>;
export type IndicatorResult = z.infer<typeof IndicatorResultSchema>;
export type CheckupResponse = z.infer<typeof CheckupResponseSchema>;
export type CaregiverCheckupResponse = z.infer<typeof CaregiverCheckupResponseSchema>;
