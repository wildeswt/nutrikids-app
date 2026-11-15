import { createHash, randomInt } from 'node:crypto';
import type { RecoveryCodesResponse, TwoFactorSetup, TwoFactorStatus } from '@nutrikids/shared';
import QRCode from 'qrcode';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { decryptSecret, encryptSecret } from '../lib/secretBox.js';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from '../lib/totp.js';
import { logAuditEvent } from './audit.service.js';

/**
 * Segundo factor TOTP obligatorio para las cuentas con perfil profesional (NK-10, RT-06).
 *
 * Flujo sin estado en el servidor: el cliente reenvía `POST /auth/login` con el mismo cuerpo
 * más `totpCode` o `recoveryCode`.
 * - Sin activar: se guarda una clave pendiente cifrada (`totp_secret_enc`, `totp_enabled_at`
 *   nulo) y se devuelve el QR. El primer código válido la activa y genera los códigos de
 *   recuperación, que se muestran una sola vez.
 * - Activado: se exige el código TOTP (no reutilizable) o un código de recuperación (de un uso).
 */

export const RECOVERY_CODE_COUNT = 10;
/** Sin 0/O, 1/I/L para evitar confusiones al transcribir. */
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_GROUP = 4;

const INVALID_CODE_MESSAGE = 'Código de verificación inválido';

export interface ProfessionalTwoFactorState {
  userId: string;
  totpSecretEnc: string | null;
  totpEnabledAt: Date | null;
  recoveryCodeHashes: string[];
  totpLastUsedStep: bigint | null;
}

/** Campos de `professionals` que necesita la verificación (para `select` de Prisma). */
export const professionalTwoFactorSelect = {
  userId: true,
  specialty: true,
  totpSecretEnc: true,
  totpEnabledAt: true,
  recoveryCodeHashes: true,
  totpLastUsedStep: true,
} as const;

export interface SecondFactorInput {
  totpCode?: string | undefined;
  recoveryCode?: string | undefined;
}

export type SecondFactorOutcome =
  { status: 'challenge'; setup?: TwoFactorSetup } | { status: 'passed'; recoveryCodes?: string[] };

/** Normaliza un código de recuperación (mayúsculas, sin espacios ni guiones) y lo resume con SHA-256. */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Genera `RECOVERY_CODE_COUNT` códigos `XXXX-XXXX` (~39 bits cada uno) y sus hashes. */
export function generateRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  while (codes.length < RECOVERY_CODE_COUNT) {
    let raw = '';
    for (let i = 0; i < RECOVERY_CODE_GROUP * 2; i += 1) {
      raw += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
    }
    const code = `${raw.slice(0, RECOVERY_CODE_GROUP)}-${raw.slice(RECOVERY_CODE_GROUP)}`;
    if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

async function buildSetup(accountName: string, secret: string): Promise<TwoFactorSetup> {
  const otpauthUri = buildOtpauthUri(accountName, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });
  return { secret, otpauthUri, qrCodeDataUrl };
}

function auditTwoFactorEvent(userId: string, event: string): void {
  logAuditEvent({
    userId,
    action: 'UPDATE',
    entityType: 'users',
    entityId: userId,
    details: { twoFactor: event },
  }).catch((err) => {
    // La falla de auditoría no bloquea el inicio de sesión.
    console.error('[2fa] Error al registrar evento de auditoría:', err);
  });
}

function tryDecrypt(payload: string | null): string | null {
  if (!payload) return null;
  try {
    return decryptSecret(payload);
  } catch {
    return null;
  }
}

/**
 * Obtiene (o crea) la clave pendiente y devuelve los datos del QR. Si dos inicios de sesión
 * llegan a la vez, solo el primero guarda su clave y ambos reciben esa misma.
 */
async function getOrCreatePendingSetup(
  accountName: string,
  professional: ProfessionalTwoFactorState,
): Promise<TwoFactorSetup> {
  const existing = tryDecrypt(professional.totpSecretEnc);
  if (existing) {
    return buildSetup(accountName, existing);
  }

  const secret = generateTotpSecret();
  const created = await prisma.professional.updateMany({
    where: {
      userId: professional.userId,
      totpEnabledAt: null,
      totpSecretEnc: professional.totpSecretEnc,
    },
    data: { totpSecretEnc: encryptSecret(secret) },
  });

  if (created.count === 0) {
    const current = await prisma.professional.findUnique({
      where: { userId: professional.userId },
      select: { totpSecretEnc: true, totpEnabledAt: true },
    });
    const stored = current?.totpEnabledAt ? null : tryDecrypt(current?.totpSecretEnc ?? null);
    if (!stored) {
      throw HttpError.conflict(
        'No se pudo preparar la verificación en dos pasos; intenta de nuevo',
      );
    }
    return buildSetup(accountName, stored);
  }

  return buildSetup(accountName, secret);
}

/**
 * Verifica un código TOTP de una cuenta ya activada y registra su paso para que no pueda
 * volver a usarse (la actualización condicional es atómica frente a solicitudes simultáneas).
 */
async function consumeTotpCode(
  professional: ProfessionalTwoFactorState,
  code: string,
): Promise<void> {
  const secret = professional.totpSecretEnc ? decryptSecret(professional.totpSecretEnc) : null;
  const step = secret ? verifyTotp(secret, code) : null;
  if (step === null) {
    throw HttpError.unauthorized(INVALID_CODE_MESSAGE);
  }
  const updated = await prisma.professional.updateMany({
    where: {
      userId: professional.userId,
      OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: BigInt(step) } }],
    },
    data: { totpLastUsedStep: BigInt(step) },
  });
  if (updated.count === 0) {
    throw HttpError.unauthorized(INVALID_CODE_MESSAGE);
  }
}

/** Consume un código de recuperación (compare-and-swap sobre la lista de hashes). */
async function consumeRecoveryCode(
  professional: ProfessionalTwoFactorState,
  code: string,
): Promise<void> {
  const hash = hashRecoveryCode(code);
  if (!professional.recoveryCodeHashes.includes(hash)) {
    throw HttpError.unauthorized(INVALID_CODE_MESSAGE);
  }
  const remaining = professional.recoveryCodeHashes.filter((h) => h !== hash);
  const updated = await prisma.professional.updateMany({
    where: {
      userId: professional.userId,
      recoveryCodeHashes: { equals: professional.recoveryCodeHashes },
    },
    data: { recoveryCodeHashes: remaining },
  });
  if (updated.count === 0) {
    throw HttpError.unauthorized(INVALID_CODE_MESSAGE);
  }
  auditTwoFactorEvent(professional.userId, 'recovery_code_used');
}

/**
 * Evalúa el segundo factor de un profesional cuya contraseña ya fue validada.
 * Devuelve `challenge` (sin tokens) o `passed`; lanza 401 si el código no es válido.
 */
export async function checkLoginSecondFactor(
  accountName: string,
  professional: ProfessionalTwoFactorState,
  input: SecondFactorInput,
): Promise<SecondFactorOutcome> {
  if (!professional.totpEnabledAt) {
    if (input.recoveryCode) {
      throw HttpError.unauthorized(
        'Primero activa la verificación en dos pasos con tu aplicación autenticadora',
      );
    }
    if (!input.totpCode) {
      return {
        status: 'challenge',
        setup: await getOrCreatePendingSetup(accountName, professional),
      };
    }

    const secret = tryDecrypt(professional.totpSecretEnc);
    const step = secret ? verifyTotp(secret, input.totpCode) : null;
    if (step === null) {
      throw HttpError.unauthorized(INVALID_CODE_MESSAGE);
    }

    const { codes, hashes } = generateRecoveryCodes();
    const activated = await prisma.professional.updateMany({
      where: {
        userId: professional.userId,
        totpEnabledAt: null,
        totpSecretEnc: professional.totpSecretEnc,
      },
      data: {
        totpEnabledAt: new Date(),
        totpLastUsedStep: BigInt(step),
        recoveryCodeHashes: hashes,
      },
    });
    if (activated.count === 0) {
      throw HttpError.unauthorized(INVALID_CODE_MESSAGE);
    }
    auditTwoFactorEvent(professional.userId, 'enabled');
    return { status: 'passed', recoveryCodes: codes };
  }

  if (input.totpCode) {
    await consumeTotpCode(professional, input.totpCode);
    return { status: 'passed' };
  }
  if (input.recoveryCode) {
    await consumeRecoveryCode(professional, input.recoveryCode);
    return { status: 'passed' };
  }
  return { status: 'challenge' };
}

async function loadProfessional(userId: string): Promise<ProfessionalTwoFactorState> {
  const professional = await prisma.professional.findUnique({
    where: { userId },
    select: professionalTwoFactorSelect,
  });
  if (!professional) {
    throw HttpError.forbidden('Solo las cuentas profesionales usan verificación en dos pasos');
  }
  return professional;
}

/** Estado del segundo factor del profesional autenticado (`GET /auth/2fa/status`). */
export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const professional = await loadProfessional(userId);
  return {
    enabled: professional.totpEnabledAt !== null,
    recoveryCodesRemaining: professional.totpEnabledAt ? professional.recoveryCodeHashes.length : 0,
  };
}

/**
 * Genera códigos de recuperación nuevos e invalida los anteriores
 * (`POST /auth/2fa/recovery-codes`). Exige un código TOTP vigente y no usado.
 */
export async function regenerateRecoveryCodes(
  userId: string,
  totpCode: string,
): Promise<RecoveryCodesResponse> {
  const professional = await loadProfessional(userId);
  if (!professional.totpEnabledAt) {
    throw HttpError.conflict('La verificación en dos pasos aún no está activada');
  }
  await consumeTotpCode(professional, totpCode);

  const { codes, hashes } = generateRecoveryCodes();
  await prisma.professional.update({
    where: { userId },
    data: { recoveryCodeHashes: hashes },
  });
  auditTwoFactorEvent(userId, 'recovery_codes_regenerated');
  return { recoveryCodes: codes };
}
