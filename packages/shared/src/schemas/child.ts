import { z } from 'zod';
import {
  EmailSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  requiredText,
} from './common.js';
import { SexSchema } from './enums.js';

/**
 * Niño, vínculos y consentimiento. Solo se piden los datos mínimos
 * del niño: nombres, apellidos, fecha de nacimiento y sexo.
 */

export const MIN_CHILD_AGE_MONTHS = 12;
export const MAX_CHILD_AGE_MONTHS = 60;

/** Fecha de hoy `YYYY-MM-DD` (UTC), usada por defecto como fecha de referencia. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Meses cumplidos entre dos fechas `YYYY-MM-DD` ya validadas.
 * Misma regla que `ageInMonths` de `@nutrikids/who-growth` (meses completos).
 */
export function completedMonths(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/**
 * Valida si la edad en meses cumplidos está en el rango de los patrones de referencia de la OMS (12 a 60 meses).
 */
export function isAgeInOmsRange(
  birthDateIso: string,
  referenceDateIso: string = todayIsoDate(),
): boolean {
  const months = completedMonths(birthDateIso, referenceDateIso);
  return months >= MIN_CHILD_AGE_MONTHS && months <= MAX_CHILD_AGE_MONTHS;
}

/**
 * Crea el esquema de alta de niño. `today` se inyecta para poder probar los límites
 * de edad sin depender del día en que corre la prueba.
 */
export function createChildInputSchema(today: () => string = todayIsoDate) {
  return z
    .strictObject({
      firstName: requiredText(100),
      lastName: requiredText(100),
      birthDate: IsoDateSchema,
      sex: SexSchema,
      relationship: requiredText(50),
      isLegalRepresentative: z.boolean(),
      /** Versión del texto del consentimiento aceptado en el alta (por defecto 'v1'). */
      consentTextVersion: requiredText(50).default('v1'),
    })
    .superRefine((value, ctx) => {
      const ref = today();
      if (value.birthDate > ref) {
        ctx.addIssue({
          code: 'custom',
          path: ['birthDate'],
          message: 'La fecha de nacimiento no puede ser futura',
        });
        return;
      }
      const months = completedMonths(value.birthDate, ref);
      if (months < MIN_CHILD_AGE_MONTHS || months > MAX_CHILD_AGE_MONTHS) {
        ctx.addIssue({
          code: 'custom',
          path: ['birthDate'],
          message: `El niño debe tener entre ${MIN_CHILD_AGE_MONTHS} y ${MAX_CHILD_AGE_MONTHS} meses`,
        });
      }
      if (!value.isLegalRepresentative) {
        ctx.addIssue({
          code: 'custom',
          path: ['isLegalRepresentative'],
          message: 'El alta del niño debe ser realizada por su representante legal',
        });
      }
    });
}

/** Alta de niño con la fecha actual como referencia. */
export const CreateChildInputSchema = createChildInputSchema();

/** Asignar un profesional a un niño (`atiende`). `startDate` por defecto es hoy en la BD. */
export const AssignProfessionalInputSchema = z
  .strictObject({
    professionalId: UuidSchema,
    startDate: IsoDateSchema.optional(),
    endDate: IsoDateSchema.optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ['endDate'],
    error: 'La fecha de fin no puede ser anterior a la de inicio',
  });

/** Finalizar la asignación de un profesional. */
export const EndProfessionalAssignmentInputSchema = z.strictObject({ endDate: IsoDateSchema });

/** Vincular un cuidador adicional a un niño (`cuida`). Requiere `caregiverId` o `email`. */
export const AssignCaregiverInputSchema = z
  .strictObject({
    caregiverId: UuidSchema.optional(),
    email: EmailSchema.optional(),
    relationship: requiredText(50),
    isLegalRepresentative: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.caregiverId || value.email), {
    path: ['caregiverId'],
    error: 'Debes indicar el identificador o el correo del cuidador',
  });

/** Actualizar el parentesco o condición de representante legal de un cuidador vinculado (`cuida`). */
export const UpdateCaregiverLinkInputSchema = z
  .strictObject({
    relationship: requiredText(50).optional(),
    isLegalRepresentative: z.boolean().optional(),
  })
  .refine(
    (value) => value.relationship !== undefined || value.isLegalRepresentative !== undefined,
    {
      path: ['relationship'],
      error: 'Debes indicar al menos un campo para actualizar',
    },
  );

/** Otorgar consentimiento; el niño viene en la ruta y el cuidador en la sesión. */
export const GrantConsentInputSchema = z.strictObject({ textVersion: requiredText(50) });

export const ConsentResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  /** Cuidador (representante legal) que otorgó el consentimiento. */
  grantedById: UuidSchema,
  textVersion: z.string(),
  grantedAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.nullable(),
});

export const ChildResponseSchema = z.object({
  id: UuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  birthDate: IsoDateSchema,
  sex: SexSchema,
});

/** Vínculo de cuidador asignado a un niño (`cuida`). */
export const CaregiverAssignmentResponseSchema = z.object({
  caregiverId: UuidSchema,
  childId: UuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: EmailSchema,
  relationship: z.string(),
  isLegalRepresentative: z.boolean(),
});

/** Vínculo activo de profesional asignado. */
export const ProfessionalAssignmentResponseSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  professionalId: UuidSchema,
  specialty: z.string().nullable().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema.nullable(),
});

export type CreateChildInput = z.infer<typeof CreateChildInputSchema>;
export type AssignProfessionalInput = z.infer<typeof AssignProfessionalInputSchema>;
export type EndProfessionalAssignmentInput = z.infer<typeof EndProfessionalAssignmentInputSchema>;
export type AssignCaregiverInput = z.infer<typeof AssignCaregiverInputSchema>;
export type UpdateCaregiverLinkInput = z.infer<typeof UpdateCaregiverLinkInputSchema>;
export type GrantConsentInput = z.infer<typeof GrantConsentInputSchema>;
export type ConsentResponse = z.infer<typeof ConsentResponseSchema>;
export type ChildResponse = z.infer<typeof ChildResponseSchema>;
export type CaregiverAssignmentResponse = z.infer<typeof CaregiverAssignmentResponseSchema>;
export type ProfessionalAssignmentResponse = z.infer<typeof ProfessionalAssignmentResponseSchema>;
