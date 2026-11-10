import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema, requiredText } from './common.js';
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
 * Misma regla que `edadEnMeses` de `@nutrikids/who-growth` (meses completos).
 */
function completedMonths(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
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

export type CreateChildInput = z.infer<typeof CreateChildInputSchema>;
export type AssignProfessionalInput = z.infer<typeof AssignProfessionalInputSchema>;
export type EndProfessionalAssignmentInput = z.infer<typeof EndProfessionalAssignmentInputSchema>;
export type GrantConsentInput = z.infer<typeof GrantConsentInputSchema>;
export type ConsentResponse = z.infer<typeof ConsentResponseSchema>;
export type ChildResponse = z.infer<typeof ChildResponseSchema>;
