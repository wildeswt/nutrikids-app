import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export type PiiContext =
  | 'users:first_name'
  | 'users:last_name'
  | 'children:first_name'
  | 'children:last_name'
  | 'caregivers:phone';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD_PREFIX = 'nutrikids:pii:v1:';

let cachedKey: Buffer | null = null;
let cachedKeyRaw: string | null = null;

function getActiveKey(): Buffer {
  if (!cachedKey || cachedKeyRaw !== env.DATA_ENCRYPTION_KEY) {
    cachedKeyRaw = env.DATA_ENCRYPTION_KEY;
    cachedKey = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
  }
  return cachedKey;
}

export class PiiCryptoError extends Error {
  constructor(public readonly code: 'INVALID_FORMAT' | 'UNKNOWN_KEY' | 'DECRYPT_FAILED') {
    super(`PII crypto error: ${code}`);
    this.name = 'PiiCryptoError';
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`);
}

export function encryptPii(plaintext: string, context: PiiContext): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getActiveKey(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(`${AAD_PREFIX}${context}`, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return [
    VERSION,
    env.DATA_ENCRYPTION_KEY_ID,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptPii(ciphertext: string, context: PiiContext): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new PiiCryptoError('INVALID_FORMAT');
  }

  const [_, keyId, ivB64, tagB64, dataB64] = parts;
  if (!keyId || !ivB64 || !tagB64 || !dataB64) {
    throw new PiiCryptoError('INVALID_FORMAT');
  }
  if (keyId !== env.DATA_ENCRYPTION_KEY_ID) {
    throw new PiiCryptoError('UNKNOWN_KEY');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, getActiveKey(), Buffer.from(ivB64, 'base64url'), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(`${AAD_PREFIX}${context}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new PiiCryptoError('DECRYPT_FAILED');
  }
}
