import { z } from 'zod';

// Mensajes de validación en español para la API y la app (NK-15, RT-10).
z.config(z.locales.es());

/** UUID (los ids de control, resultado, alerta y seguimiento los genera el cliente). */
export const UuidSchema = z.uuid({ error: 'Debe ser un identificador válido' });

/** Fecha sin zona horaria, formato `YYYY-MM-DD` (columnas `date`). */
export const IsoDateSchema = z.iso.date({ error: 'Debe ser una fecha con formato AAAA-MM-DD' });

/** Instante ISO 8601 con zona (`Z` o desfase), para columnas `timestamptz`. */
export const IsoDateTimeSchema = z.iso.datetime({
  offset: true,
  error: 'Debe ser una fecha y hora válidas (ISO 8601 con zona horaria)',
});

/** Correo normalizado: sin espacios en los extremos y en minúsculas. */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Debe ser un correo válido' }));

/** Texto obligatorio sin espacios en los extremos y con largo máximo. */
export function requiredText(max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: 'Este campo es obligatorio' })
    .max(max, { error: `Debe tener como máximo ${max} caracteres` });
}

/** Respuesta de error de la API; `issues` aparece en errores de validación (400). */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
