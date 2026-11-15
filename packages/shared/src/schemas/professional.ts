import { z } from 'zod';
import { SpecialtySchema } from './enums.js';
import { UuidSchema, requiredText } from './common.js';

/** Parámetros de GET /professionals/lookup: registro profesional a buscar. */
export const ProfessionalLookupQuerySchema = z.strictObject({
  license: requiredText(50),
});

/**
 * Resultado de la búsqueda por registro: solo lo necesario para confirmar la identidad
 * del profesional. Nunca incluye correo, teléfono ni el registro.
 */
export const ProfessionalLookupResponseSchema = z.object({
  professionalId: UuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  specialty: SpecialtySchema,
});

export type ProfessionalLookupQuery = z.infer<typeof ProfessionalLookupQuerySchema>;
export type ProfessionalLookupResponse = z.infer<typeof ProfessionalLookupResponseSchema>;
