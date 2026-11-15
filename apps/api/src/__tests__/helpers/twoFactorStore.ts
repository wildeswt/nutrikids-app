import { vi } from 'vitest';
import { prisma } from '../../lib/prisma.js';

/**
 * Doble en memoria de `prisma.professional` para el segundo factor (NK-10). Implementa solo los
 * filtros que usa `twoFactor.service.ts` (`updateMany` condicional, `findUnique`, `update`) para
 * que las pruebas ejerciten la activación, la protección contra reutilización y el consumo de
 * códigos de recuperación sin tocar la base de datos compartida.
 */

export interface TwoFactorFields {
  totpSecretEnc: string | null;
  totpEnabledAt: Date | null;
  recoveryCodeHashes: string[];
  totpLastUsedStep: bigint | null;
}

export interface MemProfessionalWith2fa extends TwoFactorFields {
  userId: string;
  specialty: string;
  licenseNumber?: string;
}

export const EMPTY_TWO_FACTOR: TwoFactorFields = {
  totpSecretEnc: null,
  totpEnabledAt: null,
  recoveryCodeHashes: [],
  totpLastUsedStep: null,
};

type Where = Record<string, unknown>;

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function matches(p: MemProfessionalWith2fa, where: Where): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(condition as Where[]).some((sub) => matches(p, sub))) return false;
      continue;
    }
    const value = (p as unknown as Record<string, unknown>)[key];
    if (condition === null) {
      if (value !== null) return false;
    } else if (typeof condition === 'object' && !(condition instanceof Date)) {
      const op = condition as { lt?: bigint; equals?: string[] };
      if (op.lt !== undefined && !(typeof value === 'bigint' && value < op.lt)) return false;
      if (op.equals !== undefined && !sameArray(value as string[], op.equals)) return false;
    } else if (value !== condition) {
      return false;
    }
  }
  return true;
}

/** Copia profunda: el servicio recibe una instantánea, como con una lectura real. */
export function snapshot<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Instala los mocks sobre `prisma.professional` y `prisma.auditLog` leyendo y modificando la
 * lista que devuelve `getProfessionals` (puede cambiar entre pruebas).
 */
export function mockTwoFactorStore(getProfessionals: () => MemProfessionalWith2fa[]) {
  const auditEvents: { userId: string; details?: unknown }[] = [];

  vi.spyOn(prisma.professional, 'updateMany').mockImplementation((async ({
    where,
    data,
  }: {
    where: Where;
    data: Partial<TwoFactorFields>;
  }) => {
    let count = 0;
    for (const p of getProfessionals()) {
      if (matches(p, where)) {
        Object.assign(p, snapshot(data));
        count += 1;
      }
    }
    return { count };
  }) as never);

  vi.spyOn(prisma.professional, 'update').mockImplementation((async ({
    where,
    data,
  }: {
    where: { userId: string };
    data: Partial<TwoFactorFields>;
  }) => {
    const p = getProfessionals().find((item) => item.userId === where.userId);
    if (!p) throw new Error('Registro no encontrado');
    Object.assign(p, snapshot(data));
    return snapshot(p);
  }) as never);

  vi.spyOn(prisma.auditLog, 'create').mockImplementation((async ({
    data,
  }: {
    data: { userId: string; details?: unknown };
  }) => {
    auditEvents.push(data);
    return data;
  }) as never);

  return { auditEvents };
}

/** `findUnique` por `userId` sobre el mismo almacén (para el estado y la regeneración de códigos). */
export function mockProfessionalFindByUserId(getProfessionals: () => MemProfessionalWith2fa[]) {
  vi.spyOn(prisma.professional, 'findUnique').mockImplementation((async ({
    where,
  }: {
    where: { userId?: string; licenseNumber?: string };
  }) => {
    const p = getProfessionals().find((item) =>
      where.userId ? item.userId === where.userId : item.licenseNumber === where.licenseNumber,
    );
    return p ? snapshot(p) : null;
  }) as never);
}
