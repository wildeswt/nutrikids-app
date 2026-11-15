import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) con HMAC-SHA1, 6 dígitos y pasos de 30 s: los parámetros por defecto que
 * entienden Google Authenticator, Microsoft Authenticator, Authy y similares (NK-10, RT-06).
 */

export const TOTP_ISSUER = 'NutriKids';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Pasos aceptados antes y después del actual, para tolerar desfase de reloj (±30 s). */
export const TOTP_WINDOW = 1;
/** 160 bits, el tamaño recomendado por RFC 4226 para HMAC-SHA1. */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Codifica en base32 (RFC 4648) sin relleno, como lo esperan las aplicaciones autenticadoras. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decodifica base32 (ignora espacios, guiones, relleno y mayúsculas/minúsculas). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Clave base32 inválida');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Genera una clave TOTP aleatoria en base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** Paso de tiempo (contador RFC 6238) para un instante en milisegundos. */
export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** HOTP (RFC 4226) para un contador; `key` son los bytes de la clave. */
export function hotp(key: Buffer, counter: number, digits: number = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** Código TOTP vigente para una clave base32 (útil en pruebas). */
export function generateTotp(secret: string, nowMs: number = Date.now()): string {
  return hotp(base32Decode(secret), totpStep(nowMs));
}

/**
 * Verifica un código TOTP dentro de la ventana ±`TOTP_WINDOW` y devuelve el paso que coincidió
 * (para impedir reutilizarlo), o `null` si no es válido. La comparación es de tiempo constante.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const key = base32Decode(secret);
  const current = totpStep(nowMs);
  const candidate = Buffer.from(code, 'utf8');
  let matched: number | null = null;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const step = current + delta;
    const expected = Buffer.from(hotp(key, step), 'utf8');
    if (timingSafeEqual(expected, candidate) && matched === null) {
      matched = step;
    }
  }
  return matched;
}

/** URI `otpauth://` que codifica el QR (formato de Google Authenticator "Key Uri Format"). */
export function buildOtpauthUri(accountName: string, secret: string): string {
  const label = `${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
