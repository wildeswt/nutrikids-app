import { describe, expect, it } from 'vitest';
import {
  AuthResponseSchema,
  AuthUserSchema,
  LoginInputSchema,
  LogoutInputSchema,
  RefreshInputSchema,
  RegisterInputSchema,
} from '../index.js';

const caregiver = {
  email: 'ana@correo.com',
  password: 'clave-segura-1',
  firstName: 'Ana',
  lastName: 'Pérez',
  roles: ['CAREGIVER'],
};

const professional = {
  ...caregiver,
  email: 'luis@hospital.ec',
  roles: ['PROFESSIONAL'],
  specialty: 'pediatrics',
  licenseNumber: 'MSP-12345',
};

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe('RegisterInputSchema', () => {
  it('acepta un cuidador y normaliza el correo', () => {
    const result = RegisterInputSchema.safeParse({ ...caregiver, email: '  Ana@Correo.COM ' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('ana@correo.com');
  });

  it('acepta un profesional con especialidad y licencia', () => {
    expect(RegisterInputSchema.safeParse(professional).success).toBe(true);
  });

  it('acepta una cuenta con ambos perfiles', () => {
    expect(
      RegisterInputSchema.safeParse({ ...professional, roles: ['CAREGIVER', 'PROFESSIONAL'] })
        .success,
    ).toBe(true);
  });

  it('exige especialidad y licencia a los profesionales', () => {
    const result = RegisterInputSchema.safeParse({ ...caregiver, roles: ['PROFESSIONAL'] });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['specialty', 'licenseNumber']));
  });

  it('rechaza especialidad o licencia en un cuidador', () => {
    const result = RegisterInputSchema.safeParse({ ...caregiver, specialty: 'nursing' });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe('Solo los profesionales tienen especialidad');
  });

  it('rechaza perfiles vacíos o repetidos', () => {
    expect(RegisterInputSchema.safeParse({ ...caregiver, roles: [] }).success).toBe(false);
    expect(
      RegisterInputSchema.safeParse({ ...caregiver, roles: ['CAREGIVER', 'CAREGIVER'] }).success,
    ).toBe(false);
  });

  it('valida el largo de la contraseña (8 a 128)', () => {
    const short = RegisterInputSchema.safeParse({ ...caregiver, password: '1234567' });
    expect(short.success).toBe(false);
    expect(firstMessage(short)).toBe('La contraseña debe tener al menos 8 caracteres');
    expect(RegisterInputSchema.safeParse({ ...caregiver, password: '12345678' }).success).toBe(
      true,
    );
    expect(RegisterInputSchema.safeParse({ ...caregiver, password: 'a'.repeat(129) }).success).toBe(
      false,
    );
  });

  it('rechaza nombres vacíos y correos inválidos', () => {
    expect(RegisterInputSchema.safeParse({ ...caregiver, firstName: '   ' }).success).toBe(false);
    expect(RegisterInputSchema.safeParse({ ...caregiver, email: 'ana' }).success).toBe(false);
  });

  it('rechaza campos desconocidos (por ejemplo status o id)', () => {
    const result = RegisterInputSchema.safeParse({ ...caregiver, status: 'suspended' });
    expect(result.success).toBe(false);
    expect(RegisterInputSchema.safeParse({ ...caregiver, id: 'x' }).success).toBe(false);
  });
});

describe('LoginInputSchema', () => {
  const base = { email: 'luis@hospital.ec', password: 'clave-segura-1' };

  it('acepta credenciales, con código TOTP o con código de recuperación', () => {
    expect(LoginInputSchema.safeParse(base).success).toBe(true);
    expect(LoginInputSchema.safeParse({ ...base, totpCode: '123456' }).success).toBe(true);
    expect(LoginInputSchema.safeParse({ ...base, recoveryCode: 'ABCD-EFGH' }).success).toBe(true);
  });

  it('rechaza un código TOTP que no tiene 6 dígitos', () => {
    const result = LoginInputSchema.safeParse({ ...base, totpCode: '12345' });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe('El código debe tener 6 dígitos');
    expect(LoginInputSchema.safeParse({ ...base, totpCode: 'abcdef' }).success).toBe(false);
  });

  it('rechaza enviar TOTP y código de recuperación a la vez', () => {
    expect(
      LoginInputSchema.safeParse({ ...base, totpCode: '123456', recoveryCode: 'ABCD' }).success,
    ).toBe(false);
  });

  it('rechaza contraseña vacía y campos desconocidos', () => {
    expect(LoginInputSchema.safeParse({ ...base, password: '' }).success).toBe(false);
    expect(LoginInputSchema.safeParse({ ...base, roles: ['PROFESSIONAL'] }).success).toBe(false);
  });
});

describe('RefreshInputSchema y LogoutInputSchema', () => {
  it('exigen el token de renovación y rechazan extras', () => {
    expect(RefreshInputSchema.safeParse({ refreshToken: 'abc' }).success).toBe(true);
    expect(RefreshInputSchema.safeParse({ refreshToken: '' }).success).toBe(false);
    expect(RefreshInputSchema.safeParse({}).success).toBe(false);
    expect(LogoutInputSchema.safeParse({ refreshToken: 'abc' }).success).toBe(true);
    expect(LogoutInputSchema.safeParse({ refreshToken: 'abc', x: 1 }).success).toBe(false);
  });
});

describe('AuthUserSchema (lista blanca)', () => {
  it('solo declara campos públicos', () => {
    expect(Object.keys(AuthUserSchema.shape).sort()).toEqual([
      'email',
      'firstName',
      'id',
      'lastName',
      'roles',
      'specialty',
    ]);
  });

  it('no deja pasar hash de contraseña ni datos del segundo factor', () => {
    const parsed = AuthUserSchema.parse({
      id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      email: 'luis@hospital.ec',
      firstName: 'Luis',
      lastName: 'Mora',
      roles: ['PROFESSIONAL'],
      specialty: 'pediatrics',
      passwordHash: 'secreto',
      totpSecretEnc: 'secreto',
      recoveryCodeHashes: ['x'],
    });
    expect(parsed).not.toHaveProperty('passwordHash');
    expect(parsed).not.toHaveProperty('totpSecretEnc');
    expect(parsed).not.toHaveProperty('recoveryCodeHashes');
  });
});

describe('AuthResponseSchema', () => {
  const user = {
    id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
    email: 'ana@correo.com',
    firstName: 'Ana',
    lastName: 'Pérez',
    roles: ['CAREGIVER', 'PROFESSIONAL'],
    specialty: 'nursing',
  };

  it('acepta la sesión completa con ambos perfiles', () => {
    const result = AuthResponseSchema.safeParse({
      requiresTwoFactor: false,
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user,
    });
    expect(result.success).toBe(true);
  });

  it('con segundo factor pendiente no lleva tokens', () => {
    expect(AuthResponseSchema.safeParse({ requiresTwoFactor: true }).success).toBe(true);
    expect(AuthResponseSchema.safeParse({ requiresTwoFactor: false, user }).success).toBe(false);
  });
});
