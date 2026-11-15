import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Cifrado simétrico AES-256-GCM para secretos guardados en BD (la clave TOTP del profesional,
 * columna `totp_secret_enc`). Formato: `v1.<iv>.<tag>.<ciphertext>` en base64url.
 * La clave se deriva con SHA-256 de `TOTP_ENCRYPTION_KEY`.
 */

const VERSION = 'v1';
const IV_BYTES = 12;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plaintext: string, secret: string = env.TOTP_ENCRYPTION_KEY): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Descifra y verifica la integridad; lanza si el valor fue alterado o la clave no coincide. */
export function decryptSecret(payload: string, secret: string = env.TOTP_ENCRYPTION_KEY): string {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error('Formato de secreto cifrado inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
