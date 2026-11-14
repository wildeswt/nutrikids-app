import { z } from 'zod';
import { EmailSchema, UuidSchema, requiredText } from './common.js';

/**
 * Cuenta del usuario autenticado (NK-55, RF-20): consultar y editar nombre, correo y teléfono
 * de contacto.
 */

export const ACCOUNT_PHONE_MAX = 30;

const PhoneSchema = z
  .string()
  .trim()
  .max(ACCOUNT_PHONE_MAX, { error: `Debe tener como máximo ${ACCOUNT_PHONE_MAX} caracteres` })
  .regex(/^[0-9+()\-\s]*$/, { error: 'Solo números, espacios y los símbolos + - ( )' });

/**
 * `PATCH /account`: al menos un dato. Cambiar el correo (con el que se inicia sesión) exige la
 * contraseña actual. Un teléfono vacío lo borra.
 */
export const UpdateAccountInputSchema = z
  .strictObject({
    firstName: requiredText(100).optional(),
    lastName: requiredText(100).optional(),
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
    currentPassword: z.string().min(1).max(200).optional(),
  })
  .refine(
    (value) =>
      value.firstName !== undefined ||
      value.lastName !== undefined ||
      value.email !== undefined ||
      value.phone !== undefined,
    { error: 'Indica al menos un dato a cambiar' },
  )
  .refine((value) => value.email === undefined || value.currentPassword !== undefined, {
    path: ['currentPassword'],
    error: 'Para cambiar el correo indica tu contraseña actual',
  });

export const AccountResponseSchema = z.object({
  id: UuidSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** Teléfono de contacto (solo cuidadores); `null` si no hay. */
  phone: z.string().nullable(),
});

export type UpdateAccountInput = z.infer<typeof UpdateAccountInputSchema>;
export type AccountResponse = z.infer<typeof AccountResponseSchema>;
