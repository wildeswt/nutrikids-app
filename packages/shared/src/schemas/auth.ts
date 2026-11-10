import { z } from 'zod';
import { EmailSchema, UuidSchema, requiredText } from './common.js';
import { SpecialtySchema, UserRoleSchema } from './enums.js';

/**
 * Autenticación. Los esquemas de entrada son estrictos: cualquier
 * campo desconocido se rechaza. Los de salida son una lista blanca de campos públicos.
 */

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, { error: 'Debe ser un teléfono válido' });

const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, { error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres` })
  .max(PASSWORD_MAX, { error: `La contraseña debe tener como máximo ${PASSWORD_MAX} caracteres` });

// ---------- Entrada ----------

/** Registro de cuenta. Una cuenta puede ser cuidador, profesional o ambos. */
export const RegisterInputSchema = z
  .strictObject({
    email: EmailSchema,
    password: NewPasswordSchema,
    firstName: requiredText(100),
    lastName: requiredText(100),
    roles: z
      .array(UserRoleSchema)
      .min(1, { error: 'Debes elegir al menos un perfil' })
      .refine((roles) => new Set(roles).size === roles.length, {
        error: 'No repitas perfiles',
      }),
    phone: PhoneSchema.optional(),
    specialty: SpecialtySchema.optional(),
    licenseNumber: requiredText(50).optional(),
  })
  .superRefine((value, ctx) => {
    const isProfessional = value.roles.includes('PROFESSIONAL');
    if (isProfessional) {
      if (!value.specialty) {
        ctx.addIssue({
          code: 'custom',
          path: ['specialty'],
          message: 'La especialidad es obligatoria para profesionales',
        });
      }
      if (!value.licenseNumber) {
        ctx.addIssue({
          code: 'custom',
          path: ['licenseNumber'],
          message: 'El número de licencia es obligatorio para profesionales',
        });
      }
    } else {
      if (value.specialty) {
        ctx.addIssue({
          code: 'custom',
          path: ['specialty'],
          message: 'Solo los profesionales tienen especialidad',
        });
      }
      if (value.licenseNumber) {
        ctx.addIssue({
          code: 'custom',
          path: ['licenseNumber'],
          message: 'Solo los profesionales tienen número de licencia',
        });
      }
    }
  });

/**
 * Inicio de sesión. Para profesionales, el segundo paso reenvía el mismo cuerpo
 * con `totpCode` (6 dígitos) o con `recoveryCode`, nunca con ambos.
 */
export const LoginInputSchema = z
  .strictObject({
    email: EmailSchema,
    password: z
      .string()
      .min(1, { error: 'Ingresa tu contraseña' })
      .max(PASSWORD_MAX, {
        error: `La contraseña debe tener como máximo ${PASSWORD_MAX} caracteres`,
      }),
    totpCode: z
      .string()
      .regex(/^\d{6}$/, { error: 'El código debe tener 6 dígitos' })
      .optional(),
    recoveryCode: requiredText(64).optional(),
  })
  .refine((value) => !(value.totpCode && value.recoveryCode), {
    path: ['recoveryCode'],
    error: 'Usa el código de la aplicación o un código de recuperación, no ambos',
  });

const RefreshTokenSchema = z.string().min(1, { error: 'Falta el token de renovación' });

export const RefreshInputSchema = z.strictObject({ refreshToken: RefreshTokenSchema });

export const LogoutInputSchema = z.strictObject({ refreshToken: RefreshTokenSchema });

// ---------- Salida ----------

/** Usuario autenticado. Nunca incluye hash de contraseña ni datos del segundo factor. */
export const AuthUserSchema = z.object({
  id: UuidSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  roles: z.array(UserRoleSchema).min(1),
  specialty: SpecialtySchema.nullable(),
});

/**
 * Respuesta de registro, inicio de sesión y renovación. Si el profesional aún debe
 * dar el segundo factor (`requiresTwoFactor: true`), no se entregan tokens.
 */
export const AuthResponseSchema = z.discriminatedUnion('requiresTwoFactor', [
  z.object({ requiresTwoFactor: z.literal(true) }),
  z.object({
    requiresTwoFactor: z.literal(false),
    accessToken: z.string(),
    refreshToken: z.string(),
    /** Segundos de vigencia del token de acceso. */
    expiresIn: z.number().int().positive(),
    user: AuthUserSchema,
  }),
]);

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type RefreshInput = z.infer<typeof RefreshInputSchema>;
export type LogoutInput = z.infer<typeof LogoutInputSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
