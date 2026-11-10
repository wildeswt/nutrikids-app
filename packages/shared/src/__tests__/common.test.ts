import { describe, expect, it } from 'vitest';
import {
  EmailSchema,
  ErrorResponseSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  requiredText,
} from '../index.js';

describe('UuidSchema', () => {
  it('acepta un UUID y rechaza texto libre', () => {
    expect(UuidSchema.safeParse('3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c').success).toBe(true);
    expect(UuidSchema.safeParse('no-es-uuid').success).toBe(false);
  });
});

describe('fechas', () => {
  it('IsoDateSchema exige AAAA-MM-DD válido', () => {
    expect(IsoDateSchema.safeParse('2023-05-12').success).toBe(true);
    expect(IsoDateSchema.safeParse('2023-02-30').success).toBe(false);
    expect(IsoDateSchema.safeParse('12/05/2023').success).toBe(false);
  });

  it('IsoDateTimeSchema exige zona horaria', () => {
    expect(IsoDateTimeSchema.safeParse('2026-10-18T14:30:00Z').success).toBe(true);
    expect(IsoDateTimeSchema.safeParse('2026-10-18T14:30:00-05:00').success).toBe(true);
    expect(IsoDateTimeSchema.safeParse('2026-10-18T14:30:00').success).toBe(false);
  });
});

describe('EmailSchema', () => {
  it('recorta espacios y pasa a minúsculas', () => {
    expect(EmailSchema.parse('  Ana.Perez@Correo.COM ')).toBe('ana.perez@correo.com');
  });

  it('rechaza correos inválidos con mensaje en español', () => {
    const result = EmailSchema.safeParse('no-es-correo');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Debe ser un correo válido');
  });
});

describe('requiredText', () => {
  const nombre = requiredText(5);

  it('recorta espacios', () => {
    expect(nombre.parse('  Ana ')).toBe('Ana');
  });

  it('rechaza vacío o solo espacios', () => {
    const result = nombre.safeParse('   ');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Este campo es obligatorio');
  });

  it('rechaza textos más largos que el máximo', () => {
    const result = nombre.safeParse('Maximiliano');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Debe tener como máximo 5 caracteres');
  });
});

describe('locale español de Zod', () => {
  it('los errores por defecto salen en español', async () => {
    const { z } = await import('zod');
    const result = z.string().safeParse(5);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/inválida/i);
  });
});

describe('ErrorResponseSchema', () => {
  it('acepta error simple y error de validación con issues', () => {
    expect(ErrorResponseSchema.safeParse({ error: 'Not Found', message: 'Ruta' }).success).toBe(
      true,
    );
    expect(
      ErrorResponseSchema.safeParse({
        error: 'Validation Error',
        message: 'Datos inválidos',
        issues: [{ path: 'email', message: 'Debe ser un correo válido' }],
      }).success,
    ).toBe(true);
  });
});
