import { z } from 'zod';

/**
 * Enums compartidos. Los valores coinciden 1:1 con los enums de
 * `apps/api/prisma/schema.prisma` (hay una prueba de paridad que lo verifica).
 */

/** Sexo del niño (referencia OMS por sexo). */
export const SexSchema = z.enum(['FEMALE', 'MALE']);

/** Indicador antropométrico: P/E, T/E, P/T e IMC/E. */
export const IndicatorSchema = z.enum([
  'WEIGHT_FOR_AGE',
  'LENGTH_HEIGHT_FOR_AGE',
  'WEIGHT_FOR_LENGTH_HEIGHT',
  'BMI_FOR_AGE',
]);

/** Posición de medición: longitud (acostado) o talla (de pie). */
export const PositionSchema = z.enum(['RECUMBENT', 'STANDING']);

/** Quién tomó la medida del control. */
export const OriginSchema = z.enum(['CAREGIVER', 'PROFESSIONAL']);

/** Tipo de riesgo de una alerta (la gravedad va aparte, en `isSevere`). */
export const RiskSchema = z.enum(['UNDERWEIGHT', 'STUNTING', 'WASTING', 'OVERWEIGHT', 'OBESITY']);

/** Estados de una alerta: generada, pendiente de revisión, revisada y seguimiento establecido. */
export const AlertStatusSchema = z.enum([
  'GENERATED',
  'PENDING_REVIEW',
  'REVIEWED',
  'FOLLOW_UP_ESTABLISHED',
]);

/** Perfil de la cuenta (una cuenta puede tener ambos). No es un enum de la BD. */
export const USER_ROLES = {
  CAREGIVER: 'CAREGIVER',
  PROFESSIONAL: 'PROFESSIONAL',
} as const;

export const UserRoleSchema = z.enum([USER_ROLES.CAREGIVER, USER_ROLES.PROFESSIONAL]);

/** Especialidad del profesional (valor canónico en inglés; la BD también admite español). */
export const SpecialtySchema = z.enum(['nursing', 'nutrition', 'pediatrics']);

export type Sex = z.infer<typeof SexSchema>;
export type Indicator = z.infer<typeof IndicatorSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Origin = z.infer<typeof OriginSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type Specialty = z.infer<typeof SpecialtySchema>;
