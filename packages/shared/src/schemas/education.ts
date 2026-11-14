import { z } from 'zod';
import { UuidSchema } from './common.js';

/**
 * Contenido educativo sobre alimentación (RF-18), en lenguaje sencillo. Cada artículo se
 * dirige a un tramo de edad en meses (`minAgeMonths`..`maxAgeMonths`, ambos inclusive) y
 * está escrito en un idioma.
 */

/** Idioma por defecto del contenido. */
export const DEFAULT_EDUCATION_LANGUAGE = 'es';

/** Edad máxima aceptada en el filtro (meses). */
export const EDUCATION_AGE_MONTHS_MAX = 240;

// ---------- Entrada ----------

/**
 * `GET /education?ageMonths=&language=`. Sin `ageMonths` devuelve todos los tramos del idioma
 * (útil para descargar el catálogo completo y leerlo sin conexión).
 */
export const EducationQuerySchema = z.object({
  ageMonths: z.coerce
    .number({ error: 'La edad en meses debe ser un número' })
    .int({ error: 'La edad en meses debe ser un número entero' })
    .min(0, { error: 'La edad en meses no puede ser negativa' })
    .max(EDUCATION_AGE_MONTHS_MAX, {
      error: `La edad en meses debe ser como máximo ${EDUCATION_AGE_MONTHS_MAX}`,
    })
    .optional(),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,3}$/, { error: 'El idioma debe ser un código como "es" o "qu"' })
    .default(DEFAULT_EDUCATION_LANGUAGE),
});

// ---------- Salida ----------

export const EducationalContentResponseSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  body: z.string(),
  minAgeMonths: z.number().int(),
  maxAgeMonths: z.number().int(),
  language: z.string(),
});

export type EducationQuery = z.infer<typeof EducationQuerySchema>;
export type EducationalContentResponse = z.infer<typeof EducationalContentResponseSchema>;
